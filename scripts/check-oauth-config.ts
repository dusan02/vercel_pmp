/**
 * Script to check Google OAuth configuration
 * 
 * Usage: npx tsx scripts/check-oauth-config.ts
 */

console.log('🔍 Checking Google OAuth Configuration...\n');

// Check environment variables
const checks = {
    'GOOGLE_CLIENT_ID': process.env.GOOGLE_CLIENT_ID,
    'GOOGLE_CLIENT_SECRET': process.env.GOOGLE_CLIENT_SECRET,
    'AUTH_SECRET': process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    'NEXTAUTH_URL': process.env.NEXTAUTH_URL,
};

let allPassed = true;

console.log('Environment Variables:');
console.log('─'.repeat(50));

for (const [key, value] of Object.entries(checks)) {
    const isSet = !!value;
    const status = isSet ? '✅' : '❌';
    const displayValue = isSet 
        ? (key.includes('SECRET') ? '***' + value.slice(-4) : value)
        : 'NOT SET';
    
    console.log(`${status} ${key}: ${displayValue}`);
    
    if (!isSet) {
        allPassed = false;
    }
}

console.log('─'.repeat(50));
console.log('');

// Validation checks
console.log('Validation Checks:');
console.log('─'.repeat(50));

// Check GOOGLE_CLIENT_ID format
if (checks.GOOGLE_CLIENT_ID) {
    const isValidFormat = checks.GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com') || 
                         checks.GOOGLE_CLIENT_ID.length > 20;
    console.log(`${isValidFormat ? '✅' : '⚠️'} GOOGLE_CLIENT_ID format: ${isValidFormat ? 'Valid' : 'May be invalid'}`);
}

// Check GOOGLE_CLIENT_SECRET format
if (checks.GOOGLE_CLIENT_SECRET) {
    const isValidFormat = checks.GOOGLE_CLIENT_SECRET.length >= 20;
    console.log(`${isValidFormat ? '✅' : '⚠️'} GOOGLE_CLIENT_SECRET format: ${isValidFormat ? 'Valid' : 'May be invalid'}`);
}

// Check AUTH_SECRET
if (checks.AUTH_SECRET) {
    const isValidLength = checks.AUTH_SECRET.length >= 32;
    console.log(`${isValidLength ? '✅' : '⚠️'} AUTH_SECRET length: ${checks.AUTH_SECRET.length} ${isValidLength ? '(OK)' : '(Should be at least 32 characters)'}`);
} else {
    console.log('❌ AUTH_SECRET: Missing');
    allPassed = false;
}

// Check NEXTAUTH_URL
if (checks.NEXTAUTH_URL) {
    const isHttps = checks.NEXTAUTH_URL.startsWith('https://');
    const hasNoTrailingSlash = !checks.NEXTAUTH_URL.endsWith('/');
    console.log(`${isHttps ? '✅' : '⚠️'} NEXTAUTH_URL protocol: ${isHttps ? 'HTTPS' : 'HTTP (use HTTPS for production)'}`);
    console.log(`${hasNoTrailingSlash ? '✅' : '⚠️'} NEXTAUTH_URL format: ${hasNoTrailingSlash ? 'No trailing slash' : 'Has trailing slash (remove it)'}`);
} else {
    console.log('⚠️ NEXTAUTH_URL: Not set (will use default)');
}

console.log('─'.repeat(50));
console.log('');

// Final result
if (allPassed) {
    console.log('✅ All required environment variables are set!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Verify redirect URIs in Google Cloud Console match NEXTAUTH_URL');
    console.log('2. Test sign-in: npm run dev:server and visit http://localhost:3000');
} else {
    console.log('❌ Some environment variables are missing!');
    console.log('');
    console.log('Please set the following in your .env.local or production environment:');
    if (!checks.GOOGLE_CLIENT_ID) console.log('  - GOOGLE_CLIENT_ID');
    if (!checks.GOOGLE_CLIENT_SECRET) console.log('  - GOOGLE_CLIENT_SECRET');
    if (!checks.AUTH_SECRET) console.log('  - AUTH_SECRET (or NEXTAUTH_SECRET)');
    console.log('');
    console.log('See GOOGLE_OAUTH_SETUP.md for detailed instructions.');
}

process.exit(allPassed ? 0 : 1);

