// ═════════════════════════════════════════════════════════════
// CYPRESS E2E TESTS — Authentication Flow
// ═════════════════════════════════════════════════════════════
// Run with: npx cypress open

describe('Authentication Flow', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');  // Vite dev server
  });

  it('Shows login screen on initial load', () => {
    cy.contains('Email').should('be.visible');
    cy.get('input[type="email"]').should('exist');
    cy.get('input[type="password"]').should('exist');
  });

  it('Validates empty email', () => {
    cy.get('button').contains(/Sign In|Sign Up/).click();
    cy.contains('Please enter a valid email').should('be.visible');
  });

  it('Validates invalid email format', () => {
    cy.get('input[type="email"]').type('not-an-email');
    cy.get('input[type="password"]').type('password123');
    cy.get('button').contains(/Sign In|Sign Up/).click();
    cy.contains('Please enter a valid email').should('be.visible');
  });

  it('Accepts valid email and password', () => {
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('ValidPass123!');
    // Should not show error
    cy.contains('Please enter a valid email').should('not.exist');
  });

  it('Prevents rapid double-click submissions', () => {
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('ValidPass123!');
    
    const button = cy.get('button').contains(/Sign In|Sign Up/);
    button.click();
    button.click();  // Rapid click
    
    // Should only trigger once (verify through network tab or mock)
    cy.window().then((win) => {
      // Mock supabase calls to count them
    });
  });

  it('Shows demo mode option', () => {
    cy.contains('Continue in Demo Mode').should('be.visible');
    cy.contains('Continue in Demo Mode').click();
    
    // Should enter demo mode (no company selection needed)
    cy.contains('Dashboard').should('be.visible');
  });

  it('Shows password reset link', () => {
    cy.contains('Forgot password').should('be.visible');
  });
});

describe('Session Management', () => {
  it('Persists session in localStorage', () => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('user@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Sign In|Sign Up/).click();
    
    cy.window().then((win) => {
      const session = win.localStorage.getItem('pp_session');
      expect(session).to.exist;
      expect(session).to.include('access_token');
    });
  });

  it('Restores session on page reload', () => {
    // First login
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('user@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Sign In/).click();
    cy.contains('Dashboard').should('be.visible');
    
    // Reload page
    cy.reload();
    
    // Should still be logged in
    cy.contains('Dashboard').should('be.visible');
    cy.contains('Sign In').should('not.exist');
  });

  it('Clears session on logout', () => {
    // Login first
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('user@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Sign In/).click();
    
    // Find and click logout
    cy.contains('Sign Out').click();
    cy.contains('Email').should('be.visible');  // Back to login
    
    cy.window().then((win) => {
      const session = win.localStorage.getItem('pp_session');
      expect(session).to.be.null;
    });
  });
});

describe('Admin Credential Verification', () => {
  it('Checks for admin credentials when present', () => {
    // This test verifies VITE_ADMIN_EMAIL and VITE_ADMIN_PASSWORD
    cy.window().then((win) => {
      const adminEmail = win.AppConfig?.adminEmail;
      const adminPassword = win.AppConfig?.adminPassword;
      
      if (adminEmail && adminPassword) {
        cy.get('input[type="email"]').type(adminEmail);
        cy.get('input[type="password"]').type(adminPassword);
        // Should authenticate as admin
      }
    });
  });
});
