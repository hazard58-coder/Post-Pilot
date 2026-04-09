// ═════════════════════════════════════════════════════════════
// CYPRESS E2E TESTS — CSV Bulk Import
// ═════════════════════════════════════════════════════════════

describe('CSV Bulk Import', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Sign In|Demo/).click();
    cy.contains('Dashboard').should('be.visible');
  });

  it('Opens bulk upload modal', () => {
    cy.contains('Bulk Import').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('CSV').should('be.visible');
  });

  it('Shows CSV format instructions', () => {
    cy.contains('Bulk Import').click();
    cy.contains('date').should('be.visible');
    cy.contains('time').should('be.visible');
    cy.contains('content').should('be.visible');
    cy.contains('platforms').should('be.visible');
  });

  it('Rejects empty file', () => {
    cy.contains('Bulk Import').click();
    cy.get('input[type="file"]').selectFile('cypress/fixtures/empty.csv');
    
    cy.contains('error').should('be.visible');
  });

  it('Accepts valid CSV', () => {
    cy.contains('Bulk Import').click();
    
    const validCSV = `date,time,content,platforms,category
2026-05-15,09:00,Hello world,twitter|instagram,promotional
2026-05-16,10:00,Another post,linkedin,educational`;
    
    cy.get('textarea').type(validCSV);
    cy.contains('Preview').click();
    
    // Should show 2 posts
    cy.contains('2 posts').should('be.visible');
  });

  it('Validates date format', () => {
    cy.contains('Bulk Import').click();
    
    const invalidCSV = `date,time,content,platforms,category
invalid-date,09:00,Hello,twitter,promo`;
    
    cy.get('textarea').type(invalidCSV);
    cy.contains('Import').click();
    
    cy.contains('Invalid date').should('be.visible');
  });

  it('Validates time format', () => {
    cy.contains('Bulk Import').click();
    
    const invalidCSV = `date,time,content,platforms,category
2026-05-15,25:99,Hello,twitter,promo`;
    
    cy.get('textarea').type(invalidCSV);
    cy.contains('Import').click();
    
    cy.contains('Invalid time').should('be.visible');
  });

  it('Handles multiline content in CSV', () => {
    cy.contains('Bulk Import').click();
    
    const multilineCSV = `date,time,content,platforms,category
2026-05-15,09:00,"Hello
this is multiline
content",twitter,promo`;
    
    cy.get('textarea').type(multilineCSV);
    cy.contains('Preview').click();
    
    // Should preserve newlines in content
    cy.contains('Hello').should('be.visible');
    cy.contains('multiline').should('be.visible');
  });

  it('Handles escaped quotes in CSV', () => {
    cy.contains('Bulk Import').click();
    
    const quotedCSV = `date,time,content,platforms,category
2026-05-15,09:00,"Hello ""world"" test",twitter,promo`;
    
    cy.get('textarea').type(quotedCSV);
    cy.contains('Preview').click();
    
    // Should unescape quotes
    cy.contains('Hello "world" test').should('be.visible');
  });

  it('Handles platforms list', () => {
    cy.contains('Bulk Import').click();
    
    const multiPlatformCSV = `date,time,content,platforms,category
2026-05-15,09:00,Hello,twitter|instagram|linkedin,promo`;
    
    cy.get('textarea').type(multiPlatformCSV);
    cy.contains('Preview').click();
    
    // Should parse 3 platforms
    cy.contains('3 platform').should('be.visible');
  });

  it('Validates platform names', () => {
    cy.contains('Bulk Import').click();
    
    const invalidPlatformCSV = `date,time,content,platforms,category
2026-05-15,09:00,Hello,fake-platform,promo`;
    
    cy.get('textarea').type(invalidPlatformCSV);
    cy.contains('Import').click();
    
    cy.contains('Invalid platform').should('be.visible');
  });

  it('Rejects past dates', () => {
    cy.contains('Bulk Import').click();
    
    const pastCSV = `date,time,content,platforms,category
2020-01-01,09:00,Hello,twitter,promo`;
    
    cy.get('textarea').type(pastCSV);
    cy.contains('Import').click();
    
    cy.contains('Cannot schedule in the past').should('be.visible');
  });

  it('Rejects dates > 6 months ahead', () => {
    cy.contains('Bulk Import').click();
    
    const futureCSV = `date,time,content,platforms,category
2026-12-01,09:00,Hello,twitter,promo`;  // More than 6 months
    
    cy.get('textarea').type(futureCSV);
    cy.contains('Import').click();
    
    cy.contains('6 months').should('be.visible');
  });

  it('Shows import progress', () => {
    cy.contains('Bulk Import').click();
    
    // Create CSV with 50 posts
    let csv = 'date,time,content,platforms,category\n';
    for (let i = 1; i <= 50; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      csv += `${dateStr},09:00,Post ${i},twitter,promo\n`;
    }
    
    cy.get('textarea').type(csv);
    cy.contains('Import').click();
    
    // Should show progress indicator
    cy.contains(/Importing|Processing/).should('be.visible');
  });

  it('Imports posts successfully', () => {
    cy.contains('Bulk Import').click();
    
    const validCSV = `date,time,content,platforms,category
2026-05-15,09:00,Bulk post 1,twitter,promo
2026-05-16,10:00,Bulk post 2,instagram,edu`;
    
    cy.get('textarea').type(validCSV);
    cy.contains('Import').click();
    
    cy.contains('Successfully imported 2 posts').should('be.visible');
    cy.wait(2000);
    
    // Posts should appear in list
    cy.contains('Bulk post 1').should('be.visible');
    cy.contains('Bulk post 2').should('be.visible');
  });

  it('Shows partial success on error', () => {
    cy.contains('Bulk Import').click();
    
    const mixedCSV = `date,time,content,platforms,category
2026-05-15,09:00,Valid post,twitter,promo
invalid-date,09:00,Invalid post,twitter,promo
2026-05-16,10:00,Another valid,instagram,edu`;
    
    cy.get('textarea').type(mixedCSV);
    cy.contains('Import').click();
    
    // Should show "2 of 3 posts imported"
    cy.contains(/2 of 3|2 posts imported/).should('be.visible');
    cy.contains('1 error').should('be.visible');
  });

  it('Allows file upload', () => {
    cy.contains('Bulk Import').click();
    
    // Create CSV content in fixture
    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from('date,time,content,platforms,category\n2026-05-15,09:00,Hello,twitter,promo'),
      fileName: 'posts.csv',
      mimeType: 'text/csv',
    });
    
    cy.contains('Preview').click();
    cy.contains('1 post').should('be.visible');
  });

  it('Clears form on modal reopen', () => {
    cy.contains('Bulk Import').click();
    cy.get('textarea').type('Some content');
    
    cy.get('button[aria-label="Close"]').click();
    cy.contains('Bulk Import').click();
    
    cy.get('textarea').should('have.value', '');
  });

  it('Handles empty CSV rows', () => {
    cy.contains('Bulk Import').click();
    
    const csvWithEmptyRows = `date,time,content,platforms,category
2026-05-15,09:00,Post 1,twitter,promo

2026-05-16,10:00,Post 2,instagram,edu
`;
    
    cy.get('textarea').type(csvWithEmptyRows);
    cy.contains('Preview').click();
    
    // Should skip empty row and show 2 posts
    cy.contains('2 posts').should('be.visible');
  });

  it('Handles large CSV files', () => {
    cy.contains('Bulk Import').click();
    
    // Create CSV with 1000 rows
    let csv = 'date,time,content,platforms,category\n';
    for (let i = 1; i <= 1000; i++) {
      const date = new Date();
      date.setDate(date.getDate() + (i % 180));  // Spread across 6 months
      const dateStr = date.toISOString().split('T')[0];
      csv += `${dateStr},09:00,Post ${i},twitter,promo\n`;
    }
    
    cy.get('textarea').type(csv);
    cy.contains('Import').click();
    
    cy.contains('Successfully imported 1000 posts').should('be.visible');
  });

  it('Validates missing columns', () => {
    cy.contains('Bulk Import').click();
    
    const missingColumnsCSV = `date,content,platforms
2026-05-15,Hello,twitter`;  // Missing time and category
    
    cy.get('textarea').type(missingColumnsCSV);
    cy.contains('Import').click();
    
    cy.contains('Missing required column').should('be.visible');
  });

  it('Handles special characters in content', () => {
    cy.contains('Bulk Import').click();
    
    const specialCharCSV = `date,time,content,platforms,category
2026-05-15,09:00,"Hello 👋 <tag> & ""quote"" ©",twitter,promo`;
    
    cy.get('textarea').type(specialCharCSV);
    cy.contains('Preview').click();
    
    cy.contains('Hello 👋').should('be.visible');
  });

  it('Shows helpful error messages', () => {
    cy.contains('Bulk Import').click();
    
    const buggyCSV = `date,time,content,platforms,category
invalid-format,not-a-time,content,unknown-platform,bad-category`;
    
    cy.get('textarea').type(buggyCSV);
    cy.contains('Import').click();
    
    // Should show specific error for each issue
    cy.contains('Invalid date').should('be.visible');
    cy.contains('Invalid time').should('be.visible');
    cy.contains('Invalid platform').should('be.visible');
  });
});

describe('CSV Import - Edge Cases', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('Password123!');
    cy.get('button').contains(/Demo/).click();
    cy.contains('Bulk Import').click();
  });

  it('Handles BOM character in UTF-8', () => {
    // Some CSV editors add BOM
    const bomCSV = '\uFEFFdate,time,content,platforms,category\n2026-05-15,09:00,Hello,twitter,promo';
    cy.get('textarea').invoke('val', bomCSV).trigger('input');
    cy.contains('Import').click();
    
    cy.contains('Successfully imported').should('be.visible');
  });

  it('Handles Unix vs Windows line endings', () => {
    const windowsCSV = 'date,time,content,platforms,category\r\n2026-05-15,09:00,Hello,twitter,promo\r\n';
    cy.get('textarea').invoke('val', windowsCSV).trigger('input');
    cy.contains('Import').click();
    
    cy.contains('Successfully imported').should('be.visible');
  });

  it('Validates platform combinations', () => {
    const csv = `date,time,content,platforms,category
2026-05-15,09:00,Hello,twitter|fake|instagram,promo`;
    
    cy.get('textarea').type(csv);
    cy.contains('Import').click();
    
    cy.contains('Invalid platform: fake').should('be.visible');
  });

  it('Rejects content exceeding platform limits', () => {
    // Twitter = 280 chars, so test with 300 char content
    const csv = `date,time,content,platforms,category
2026-05-15,09:00,${'a'.repeat(300)},twitter,promo`;
    
    cy.get('textarea').type(csv);
    cy.contains('Import').click();
    
    cy.contains('Content too long for Twitter').should('be.visible');
  });

  it('Allows different case in platform names', () => {
    const csv = `date,time,content,platforms,category
2026-05-15,09:00,Hello,TWITTER|Instagram,promo`;
    
    cy.get('textarea').type(csv);
    cy.contains('Preview').click();
    
    // Should normalize to lowercase
    cy.contains('twitter').should('be.visible');
    cy.contains('instagram').should('be.visible');
  });
});
