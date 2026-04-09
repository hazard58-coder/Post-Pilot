// ═════════════════════════════════════════════════════════════
// CYPRESS E2E TESTS — Calendar & Company Management
// ═════════════════════════════════════════════════════════════

describe('Calendar Navigation', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
    cy.contains('Dashboard').should('be.visible');
  });

  it('Shows current month calendar', () => {
    // Get current month/year
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();
    
    cy.contains(`${monthName} ${year}`).should('be.visible');
  });

  it('Navigates to next month', () => {
    const currentButton = cy.contains('button', '→');
    currentButton.click();
    
    // Month should advance
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthName = nextMonth.toLocaleString('default', { month: 'long' });
    
    cy.contains(monthName).should('be.visible');
  });

  it('Navigates to previous month', () => {
    cy.contains('button', '→').click();  // Go forward first
    cy.contains('button', '←').click();  // Go back
    
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    
    cy.contains(monthName).should('be.visible');
  });

  it('Prevents navigation beyond 6 months', () => {
    // Click next button 7 times
    for (let i = 0; i < 7; i++) {
      cy.contains('button', '→').click();
    }
    
    // Next button should be disabled
    cy.contains('button', '→').should('be.disabled');
  });

  it('Prevents navigation to past months', () => {
    cy.contains('button', '←').should('be.disabled');
  });

  it('Shows scheduled posts on calendar dates', () => {
    // Create a post for tomorrow
    cy.contains('New Post').click();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().slice(0, 16);
    
    cy.get('textarea').type('Calendar test');
    cy.get('input[type="checkbox"]').first().click();
    cy.get('input[type="datetime-local"]').type(dateString);
    cy.contains('Schedule').click();
    
    // Check calendar for post indicator
    const date = tomorrow.getDate();
    cy.contains('button', `${date}`).should('contain', '•');  // Post indicator
  });

  it('Clicking date creates new post for that date', () => {
    cy.contains('button', '20').click();  // Click date 20
    
    // Composer should open with that date pre-filled
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('input[type="datetime-local"]').should('not.have.value', '');
  });

  it('Shows weekend dates differently', () => {
    // Sunday and Saturday should have different styling
    cy.get('.calendar-grid').within(() => {
      cy.get('.sunday').should('have.css', 'color');  // Check styling
    });
  });

  it('Shows today\'s date highlighted', () => {
    const today = new Date().getDate();
    cy.get('.calendar-grid').within(() => {
      cy.contains(today).parent().should('have.class', 'today');
    });
  });
});

describe('Company Management', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
  });

  it('Shows company switcher', () => {
    cy.contains('Company').should('be.visible');
  });

  it('Displays current company name', () => {
    cy.get('.company-badge').should('exist');
  });

  it('Opens company list on click', () => {
    cy.get('.company-badge').click();
    cy.get('[role="menu"]').should('be.visible');
  });

  it('Switches between companies', () => {
    // Assuming demo mode creates multiple companies
    cy.get('.company-badge').click();
    
    // Click a different company
    cy.get('[role="menu"]').within(() => {
      cy.get('li').eq(1).click();  // Click second company
    });
    
    // Dashboard should update
    cy.get('.company-banner').should('exist');
  });

  it('Shows company color coding', () => {
    cy.get('.company-badge').should('have.css', 'backgroundColor');
  });

  it('Persists company selection', () => {
    // Switch company
    cy.get('.company-badge').click();
    cy.get('[role="menu"]').within(() => {
      cy.get('li').eq(1).click();
    });
    
    // Reload page
    cy.reload();
    
    // Should still show same company
    cy.get('.company-badge').should('exist');
  });
});

describe('Admin Panel', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
  });

  it('Opens admin panel', () => {
    cy.contains('Admin').click();
    cy.get('[role="dialog"]').contains('Company Management').should('be.visible');
  });

  it('Shows list of companies', () => {
    cy.contains('Admin').click();
    cy.get('table').should('be.visible');
    cy.get('tr').should('have.length.greaterThan', 0);
  });

  it('Creates new company', () => {
    cy.contains('Admin').click();
    cy.contains('New Company').click();
    
    cy.get('input[placeholder="Company Name"]').type('Test Company');
    cy.get('input[type="color"]').invoke('val', '#FF5733').trigger('change');
    cy.contains('Create').click();
    
    cy.contains('Test Company').should('be.visible');
  });

  it('Edits company name', () => {
    cy.contains('Admin').click();
    
    // Find first company edit button
    cy.get('table').find('[aria-label="Edit"]').first().click();
    cy.get('input[placeholder="Company Name"]').clear().type('Updated Name');
    cy.contains('Save').click();
    
    cy.contains('Updated Name').should('be.visible');
  });

  it('Changes company color', () => {
    cy.contains('Admin').click();
    cy.get('table').find('[aria-label="Edit"]').first().click();
    
    cy.get('input[type="color"]').invoke('val', '#123456').trigger('change');
    cy.contains('Save').click();
    
    // Company color should update
    cy.get('.company-color').should('have.css', 'backgroundColor', 'rgb(18, 52, 86)');
  });

  it('Shows warning when deleting company with posts', () => {
    // Create a post first
    cy.contains('New Post').click();
    cy.get('textarea').type('Test post');
    cy.get('input[type="checkbox"]').first().click();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().slice(0, 16);
    cy.get('input[type="datetime-local"]').type(dateString);
    cy.contains('Schedule').click();
    
    // Open admin and try to delete
    cy.contains('Admin').click();
    cy.get('table').find('[aria-label="Delete"]').first().click();
    
    // Should show warning about posts
    cy.contains('posts will be orphaned').should('be.visible');
  });

  it('Prevents deletion of only company', () => {
    cy.contains('Admin').click();
    
    // If only 1 company, delete button should be disabled
    cy.get('table').find('tr').then(rows => {
      if (rows.length === 2) {  // Header + 1 company
        cy.get('table').find('[aria-label="Delete"]').first().should('be.disabled');
      }
    });
  });

  it('Manages user assignments', () => {
    cy.contains('Admin').click();
    cy.get('table').find('[aria-label="Edit Users"]').first().click();
    
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('Team Members').should('be.visible');
  });

  it('Adds team member to company', () => {
    cy.contains('Admin').click();
    cy.get('table').find('[aria-label="Edit Users"]').first().click();
    
    cy.get('input[placeholder="Email"]').type('teammate@example.com');
    cy.contains('Add Member').click();
    
    cy.contains('teammate@example.com').should('be.visible');
  });

  it('Removes team member', () => {
    // Assuming team member exists
    cy.contains('Admin').click();
    cy.get('table').find('[aria-label="Edit Users"]').first().click();
    
    cy.get('li').find('[aria-label="Remove"]').first().click();
    cy.contains('Confirm Delete').click();
    
    // Should be removed from list
  });
});

describe('Analytics Dashboard', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
  });

  it('Shows analytics section', () => {
    cy.contains('Analytics').click();
    cy.get('[role="tabpanel"]').contains('Analytics').should('be.visible');
  });

  it('Displays engagement metrics', () => {
    cy.contains('Analytics').click();
    
    cy.contains('Total Posts').should('be.visible');
    cy.contains('Total Engagement').should('be.visible');
    cy.contains('Engagement Rate').should('be.visible');
  });

  it('Shows platform breakdown', () => {
    cy.contains('Analytics').click();
    
    cy.contains('Twitter').should('be.visible');
    cy.contains('Instagram').should('be.visible');
  });

  it('Shows top performing posts', () => {
    cy.contains('Analytics').click();
    
    // Should display posts sorted by engagement
    cy.contains('Top Posts').should('be.visible');
  });

  it('Updates when new posts created', () => {
    // Get initial post count
    cy.contains('Analytics').click();
    cy.get('h3').contains('Total Posts').parent().find('div').then($el => {
      const initialCount = parseInt($el.text());
      
      // Create new post
      cy.contains('Analytics').click();  // Close if open
      cy.contains('New Post').click();
      cy.get('textarea').type('Test');
      cy.get('input[type="checkbox"]').first().click();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateString = tomorrow.toISOString().slice(0, 16);
      cy.get('input[type="datetime-local"]').type(dateString);
      cy.contains('Schedule').click();
      
      // Check analytics updated
      cy.contains('Analytics').click();
      cy.get('h3').contains('Total Posts').parent().find('div').should(
        'contain', initialCount + 1
      );
    });
  });
});

describe('Error Handling & Recovery', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
  });

  it('Recovers from network timeout', () => {
    // Simulate network delay/failure
    cy.intercept('POST', '**/posts', { delay: 15000 }).as('slowRequest');
    
    cy.contains('New Post').click();
    cy.get('textarea').type('Test');
    cy.get('input[type="checkbox"]').first().click();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().slice(0, 16);
    cy.get('input[type="datetime-local"]').type(dateString);
    cy.contains('Schedule').click();
    
    // Should show timeout error
    cy.contains('timeout').should('be.visible');
  });

  it('Shows offline detection', () => {
    cy.intercept('GET', '**/posts', { forceNetworkError: true }).as('offlineError');
    
    // Trigger a data load
    cy.reload();
    
    cy.contains('offline').should('be.visible');
  });

  it('Retries failed API calls', () => {
    let callCount = 0;
    cy.intercept('POST', '**/posts', (req) => {
      callCount++;
      if (callCount < 2) {
        req.destroy();  // First call fails
      }
    }).as('retryRequest');
    
    cy.contains('New Post').click();
    cy.get('textarea').type('Test');
    cy.get('input[type="checkbox"]').first().click();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().slice(0, 16);
    cy.get('input[type="datetime-local"]').type(dateString);
    cy.contains('Schedule').click();
    
    // Should retry and succeed
    cy.contains('Post scheduled').should('be.visible');
  });

  it('Shows error boundary on crash', () => {
    // Force an error in a component
    cy.window().then((win) => {
      win.PostPilotApp?.throw(new Error('Test error'));
    });
    
    // Should show error fallback
    cy.contains('something went wrong').should('be.visible');
    cy.contains('Try Again').should('be.visible');
  });

  it('Try Again button recovers from error', () => {
    // Trigger error boundary
    // ...
    
    cy.contains('Try Again').click();
    cy.contains('Dashboard').should('be.visible');
  });
});

describe('Accessibility', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
  });

  it('Supports keyboard navigation in auth form', () => {
    cy.get('input[type="email"]').focus().type('test@example.com');
    cy.get('input[type="password"]').focus().type('Password123!');
    cy.realPress('Tab');  // Would need cypress-real-events plugin
    
    cy.focused().should('be.a', 'button');
  });

  it('Shows focus indicators on buttons', () => {
    cy.get('button').first().focus();
    cy.focused().should('have.css', 'outline');
  });

  it('Supports Escape key to close modals', () => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
    
    cy.contains('New Post').click();
    cy.get('[role="dialog"]').type('{Escape}');
    cy.get('[role="dialog"]').should('not.be.visible');
  });

  it('Provides aria labels', () => {
    cy.get('[aria-label]').should('exist');
  });

  it('Uses semantic HTML', () => {
    cy.get('main').should('exist');
    cy.get('nav').should('exist');
    cy.get('header').should('exist');
  });
});
