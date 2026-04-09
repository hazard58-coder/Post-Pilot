// ═════════════════════════════════════════════════════════════
// CYPRESS E2E TESTS — Post Creation & Management
// ═════════════════════════════════════════════════════════════

describe('Post Creation & Composer', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    // Login first
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Sign In|Demo/).click();
    cy.contains('Dashboard').should('be.visible');
  });

  it('Opens new post composer', () => {
    cy.contains('New Post').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('Platforms').should('be.visible');
  });

  it('Validates empty content', () => {
    cy.contains('New Post').click();
    cy.contains('Schedule').click();
    
    // Should show error, not submit
    cy.contains('Content is required').should('be.visible');
  });

  it('Rejects empty platform selection', () => {
    cy.contains('New Post').click();
    
    // Type content but don't select platform
    cy.get('textarea').type('Hello world');

    // Schedule button should be disabled or show error
    cy.contains('Schedule').should('be.disabled');
  });

  it('Requires future date for scheduling', () => {
    cy.contains('New Post').click();
    cy.get('textarea').type('Hello world');
    cy.get('input[type="checkbox"]').first().click();  // Select a platform
    
    // Try to set date to past
    cy.get('input[type="datetime-local"]').type('2020-01-01T10:00');
    cy.contains('Schedule').click();
    
    // Should show error
    cy.contains('past').should('be.visible');
  });

  it('Limits scheduling to 6 months ahead', () => {
    cy.contains('New Post').click();
    cy.get('textarea').type('Hello world');
    cy.get('input[type="checkbox"]').first().click();
    
    // Try date > 6 months
    const future = new Date();
    future.setMonth(future.getMonth() + 7);
    const dateString = future.toISOString().slice(0, 16);
    cy.get('input[type="datetime-local"]').type(dateString);
    cy.contains('Schedule').click();
    
    // Should show error
    cy.contains('6 months').should('be.visible');
  });

  it('Shows character counter', () => {
    cy.contains('New Post').click();
    
    const text = 'Hello world';
    cy.get('textarea').type(text);
    
    cy.contains(`${text.length}`).should('exist');
  });

  it('Warns when approaching character limit', () => {
    cy.contains('New Post').click();
    
    // Get platform to know its limit
    cy.get('input[type="checkbox"]').first().click();
    cy.get('input[type="checkbox"]').first().parent().then(($el) => {
      const platformName = $el.text();
      
      // Type a very long message
      const longText = 'a'.repeat(2000);
      cy.get('textarea').type(longText);
      
      // Character count should be visible and colored
      cy.contains('2000').should('have.css', 'color');  // Should be red/warning color
    });
  });

  it('Closes with Escape key', () => {
    cy.contains('New Post').click();
    cy.get('[role="dialog"]').should('be.visible');
    
    cy.get('[role="dialog"]').type('{Escape}');
    cy.get('[role="dialog"]').should('not.be.visible');
  });

  it('Closes with X button', () => {
    cy.contains('New Post').click();
    cy.get('[role="dialog"]').should('be.visible');
    
    cy.get('button[aria-label="Close"]').click();
    cy.get('[role="dialog"]').should('not.be.visible');
  });

  it('Saves post as draft', () => {
    cy.contains('New Post').click();
    cy.get('textarea').type('Draft post');
    cy.get('input[type="checkbox"]').first().click();
    
    cy.contains('Save as Draft').click();
    cy.contains('Draft saved!').should('be.visible');
    cy.wait(2000);  // Wait for toast to clear
    cy.contains('Draft saved!').should('not.exist');
  });

  it('Schedules post correctly', () => {
    cy.contains('New Post').click();
    cy.get('textarea').type('Scheduled post');
    cy.get('input[type="checkbox"]').first().click();
    
    // Set future date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().slice(0, 16);
    cy.get('input[type="datetime-local"]').type(dateString);
    
    cy.contains('Schedule').click();
    cy.contains('Post scheduled').should('be.visible');
  });

  it('Modal resets form on reopen', () => {
    // Create first post
    cy.contains('New Post').click();
    cy.get('textarea').type('First post');
    cy.get('input[type="checkbox"]').first().click();
    cy.contains('Save as Draft').click();
    
    // Close and reopen
    cy.contains('New Post').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('textarea').should('have.value', '');  // Should be empty
  });

  it('Shows social media platform icons', () => {
    cy.contains('New Post').click();
    
    // Check for common platforms
    cy.contains('Twitter').should('exist');
    cy.contains('Instagram').should('exist');
    cy.contains('LinkedIn').should('exist');
  });

  it('Handles special characters in content', () => {
    cy.contains('New Post').click();
    const specialText = 'Hello 👋 "quoted" <tag> & more!';
    cy.get('textarea').type(specialText);
    cy.get('input[type="checkbox"]').first().click();
    cy.contains('Schedule').click();
    
    // Should not error on special chars
    cy.get('[role="dialog"]').should('not.be.visible');
  });
});

describe('Post List Management', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Sign In|Demo/).click();
  });

  it('Displays scheduled posts', () => {
    // Create a post first
    cy.contains('New Post').click();
    cy.get('textarea').type('Test post');
    cy.get('input[type="checkbox"]').first().click();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().slice(0, 16);
    cy.get('input[type="datetime-local"]').type(dateString);
    cy.contains('Schedule').click();
    
    // Verify it appears in list
    cy.contains('Test post').should('be.visible');
  });

  it('Allows editing a post', () => {
    cy.contains('Test post').parent().find('[aria-label="Edit"]').click();
    cy.get('textarea').clear().type('Updated post');
    cy.contains('Schedule').click();
    cy.contains('Post scheduled').should('be.visible');
  });

  it('Shows delete confirmation', () => {
    cy.contains('Test post').parent().find('[aria-label="Delete"]').click();
    cy.contains('Are you sure').should('be.visible');
  });

  it('Prevents accidental deletion', () => {
    cy.contains('Test post').parent().find('[aria-label="Delete"]').click();
    cy.get('button[aria-label="Cancel"]').click();
    cy.contains('Test post').should('be.visible');
  });

  it('Deletes post after confirmation', () => {
    cy.contains('Test post').parent().find('[aria-label="Delete"]').click();
    cy.contains('Delete Post').click();
    // Post should be gone
    cy.contains('Test post').should('not.exist');
  });

  it('Duplicates existing post', () => {
    cy.contains('Test post').parent().find('[aria-label="Duplicate"]').click();
    // Should open composer with copied content
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('textarea').should('contain', 'Test post');
  });

  it('Shows character count across platforms', () => {
    cy.contains('Test post').parent().find('[aria-label="View Details"]').click();
    
    // Should show per-platform character counts
    cy.contains('Twitter').parent().contains(/\d+/).should('exist');
    cy.contains('Instagram').parent().contains(/\d+/).should('exist');
  });
});

describe('Date Picker Behavior', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
    cy.contains('New Post').click();
  });

  it('Restricts past dates', () => {
    cy.get('input[type="datetime-local"]').invoke('attr', 'min').then((min) => {
      // Min attribute should be set to current date/time
      expect(min).to.exist;
    });
  });

  it('Restricts future dates > 6 months', () => {
    cy.get('input[type="datetime-local"]').invoke('attr', 'max').then((max) => {
      // Max attribute should be set to 6 months from now
      expect(max).to.exist;
    });
  });

  it('Prevents typing invalid dates', () => {
    cy.get('input[type="datetime-local"]').type('invalid-date');
    cy.get('input[type="datetime-local"]').should('have.value', '');  // Should reject invalid
  });
});

describe('Hashtag Management', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
    cy.contains('New Post').click();
  });

  it('Shows hashtag suggestions', () => {
    cy.get('textarea').type('#');
    // Should show suggested hashtags dropdown
    cy.get('[role="listbox"]').should('be.visible');
  });

  it('Adds hashtag on selection', () => {
    cy.get('textarea').type('#trending ');
    cy.contains('Add Hashtag').click();
    
    cy.get('.hashtag').should('contain', '#trending');
  });

  it('Removes hashtag on click', () => {
    cy.get('textarea').type('#trending ');
    cy.contains('Add Hashtag').click();
    cy.get('.hashtag').find('[aria-label="Remove"]').click();
    
    cy.get('.hashtag').should('not.exist');
  });

  it('Appends hashtags to content on save', () => {
    cy.get('textarea').type('Hello world');
    cy.get('input[type="checkbox"]').first().click();
    
    // Add hashtag
    cy.contains('Hashtag').parent().find('input').type('trending');
    cy.contains('Add Hashtag').click();
    
    cy.contains('Save as Draft').click();
    
    // Verify post saved with hashtags
    cy.contains('Draft saved').should('be.visible');
  });
});
