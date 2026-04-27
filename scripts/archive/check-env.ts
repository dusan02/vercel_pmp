console.log('--- Environment Variables ---');
console.log('POLYGON_API_KEY:', process.env.POLYGON_API_KEY ? 'EXISTS (length: ' + process.env.POLYGON_API_KEY.length + ')' : 'MISSING');
console.log('PMP_POLYGON_API_KEY:', process.env.PMP_POLYGON_API_KEY ? 'EXISTS' : 'MISSING');
console.log('DATABASE_URL:', process.env.DATABASE_URL || 'MISSING');
console.log('NODE_ENV:', process.env.NODE_ENV || 'MISSING');
console.log('---------------------------');
