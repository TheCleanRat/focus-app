// assignment-manager.js - Module for managing student assignments
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class AssignmentManager {
  constructor() {
    this.dataDir = path.join(__dirname, 'homework-data');
    this.assignmentsFile = path.join(this.dataDir, 'assignments.json');
    this.assignments = [];
  }

  async init() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing assignments
      try {
        const data = await fs.readFile(this.assignmentsFile, 'utf8');
        this.assignments = JSON.parse(data);
      } catch {
        // File doesn't exist, start with empty array
        this.assignments = [];
        await this.saveAssignments();
      }
    } catch (error) {
      console.error('Error initializing assignment manager:', error);
      this.assignments = [];
    }
  }

  async saveAssignments() {
    try {
      await fs.writeFile(this.assignmentsFile, JSON.stringify(this.assignments, null, 2));
    } catch (error) {
      console.error('Error saving assignments:', error);
      throw error;
    }
  }

  generateId() {
    return crypto.randomBytes(8).toString('hex');
  }

  async addAssignment(assignmentData) {
    const assignment = {
      id: this.generateId(),
      title: assignmentData.title || 'Untitled Assignment',
      subject: assignmentData.subject || 'General',
      description: assignmentData.description || '',
      dueDate: assignmentData.dueDate || new Date().toISOString(),
      priority: assignmentData.priority || 'medium', // high, medium, low
      estimatedTime: assignmentData.estimatedTime || 60, // minutes
      isComplete: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      homeworkChecked: false,
      homeworkFilePath: null,
      homeworkResults: null
    };

    this.assignments.push(assignment);
    await this.saveAssignments();
    
    return assignment;
  }

  async updateAssignment(assignmentId, updates) {
    const index = this.assignments.findIndex(a => a.id === assignmentId);
    if (index === -1) {
      throw new Error('Assignment not found');
    }

    // Preserve certain fields from being overwritten
    const preservedFields = ['id', 'createdAt'];
    const filteredUpdates = Object.keys(updates)
      .filter(key => !preservedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    this.assignments[index] = {
      ...this.assignments[index],
      ...filteredUpdates,
      updatedAt: new Date().toISOString()
    };

    await this.saveAssignments();
    return this.assignments[index];
  }

  async markComplete(assignmentId) {
    const assignment = this.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
      throw new Error('Assignment not found');
    }

    assignment.isComplete = true;
    assignment.completedAt = new Date().toISOString();
    assignment.updatedAt = new Date().toISOString();

    await this.saveAssignments();
    return assignment;
  }

  async markIncomplete(assignmentId) {
    const assignment = this.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
      throw new Error('Assignment not found');
    }

    assignment.isComplete = false;
    assignment.completedAt = null;
    assignment.updatedAt = new Date().toISOString();

    await this.saveAssignments();
    return assignment;
  }

  async deleteAssignment(assignmentId) {
    const index = this.assignments.findIndex(a => a.id === assignmentId);
    if (index === -1) {
      throw new Error('Assignment not found');
    }

    const deleted = this.assignments.splice(index, 1)[0];
    await this.saveAssignments();
    
    return deleted;
  }

  async getAllAssignments() {
    return [...this.assignments].sort((a, b) => {
      // Sort by completion status first (incomplete first), then by due date
      if (a.isComplete !== b.isComplete) {
        return a.isComplete ? 1 : -1;
      }
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }

  async getPendingAssignments() {
    return this.assignments
      .filter(a => !a.isComplete)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  async getCompletedAssignments() {
    return this.assignments
      .filter(a => a.isComplete)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }

  async getOverdueAssignments() {
    const now = new Date();
    return this.assignments
      .filter(a => !a.isComplete && new Date(a.dueDate) < now)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  async getUpcomingAssignments(days = 7) {
    const now = new Date();
    const future = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
    
    return this.assignments
      .filter(a => !a.isComplete && new Date(a.dueDate) >= now && new Date(a.dueDate) <= future)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  async getAssignmentsBySubject(subject) {
    return this.assignments
      .filter(a => a.subject.toLowerCase() === subject.toLowerCase())
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  async getCompletedCount() {
    return this.assignments.filter(a => a.isComplete).length;
  }

  async getTotalCount() {
    return this.assignments.length;
  }

  async getCompletionPercentage() {
    if (this.assignments.length === 0) return 100; // No assignments = 100% complete
    return Math.round((this.getCompletedCount() / this.getTotalCount()) * 100);
  }

  async linkHomeworkToAssignment(assignmentId, filePath, homeworkResults) {
    const assignment = this.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
      throw new Error('Assignment not found');
    }

    assignment.homeworkChecked = true;
    assignment.homeworkFilePath = filePath;
    assignment.homeworkResults = homeworkResults;
    assignment.updatedAt = new Date().toISOString();

    // Auto-complete if homework check was successful
    if (homeworkResults.isComplete && !assignment.isComplete) {
      assignment.isComplete = true;
      assignment.completedAt = new Date().toISOString();
    }

    await this.saveAssignments();
    return assignment;
  }

  async getStats() {
    const total = this.assignments.length;
    const completed = this.assignments.filter(a => a.isComplete).length;
    const pending = this.assignments.filter(a => !a.isComplete).length;
    const overdue = await this.getOverdueAssignments();
    const upcoming = await this.getUpcomingAssignments();

    return {
      total,
      completed,
      pending,
      overdue: overdue.length,
      upcoming: upcoming.length,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 100,
      subjects: [...new Set(this.assignments.map(a => a.subject))],
      priorities: {
        high: this.assignments.filter(a => a.priority === 'high' && !a.isComplete).length,
        medium: this.assignments.filter(a => a.priority === 'medium' && !a.isComplete).length,
        low: this.assignments.filter(a => a.priority === 'low' && !a.isComplete).length
      }
    };
  }

  async canDisableDistraction() {
    const pending = await this.getPendingAssignments();
    return pending.length === 0 && this.assignments.length > 0;
  }

  // Utility methods for homework integration
  async findAssignmentForHomework(fileName, subject = null) {
    let candidates = this.assignments.filter(a => !a.isComplete && !a.homeworkChecked);
    
    if (subject) {
      candidates = candidates.filter(a => a.subject.toLowerCase().includes(subject.toLowerCase()));
    }

    // Try to match by title similarity
    const nameWords = fileName.toLowerCase().split(/[\s\-_\.]+/);
    for (const assignment of candidates) {
      const titleWords = assignment.title.toLowerCase().split(/[\s\-_\.]+/);
      const commonWords = nameWords.filter(word => titleWords.includes(word));
      
      if (commonWords.length > 0) {
        return assignment;
      }
    }

    // Return the earliest due date if no match
    if (candidates.length > 0) {
      return candidates.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    }

    return null;
  }

  async importAssignmentsFromCalendar(calendarData) {
    // Future feature: import from Google Calendar, Outlook, etc.
    // For now, just a placeholder
    const imported = [];
    
    for (const item of calendarData) {
      if (item.title && item.dueDate) {
        const assignment = await this.addAssignment({
          title: item.title,
          subject: item.subject || 'Imported',
          description: item.description || '',
          dueDate: item.dueDate,
          priority: 'medium'
        });
        imported.push(assignment);
      }
    }
    
    return imported;
  }

  async exportAssignments(format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(this.assignments, null, 2);
      case 'csv':
        if (this.assignments.length === 0) return '';
        
        const headers = ['Title', 'Subject', 'Due Date', 'Priority', 'Status', 'Completed At'];
        const rows = this.assignments.map(a => [
          a.title,
          a.subject,
          new Date(a.dueDate).toLocaleDateString(),
          a.priority,
          a.isComplete ? 'Complete' : 'Pending',
          a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
      default:
        throw new Error('Unsupported export format');
    }
  }

  async clearCompleted() {
    const beforeCount = this.assignments.length;
    this.assignments = this.assignments.filter(a => !a.isComplete);
    await this.saveAssignments();
    
    return beforeCount - this.assignments.length; // Number of assignments removed
  }

  async resetAllAssignments() {
    this.assignments = this.assignments.map(a => ({
      ...a,
      isComplete: false,
      completedAt: null,
      homeworkChecked: false,
      homeworkFilePath: null,
      homeworkResults: null,
      updatedAt: new Date().toISOString()
    }));
    
    await this.saveAssignments();
    return this.assignments.length;
  }
}

module.exports = { AssignmentManager };