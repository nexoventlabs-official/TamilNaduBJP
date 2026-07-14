const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

const envPath = '/var/www/bjptn/backend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const config = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    config[match[1]] = value;
  }
});

const s3 = new S3Client({
  endpoint: `https://${config.B2_ENDPOINT}`,
  region: 'us-east-005',
  credentials: {
    accessKeyId: config.B2_KEY_ID,
    secretAccessKey: config.B2_APP_KEY
  },
  forcePathStyle: true
});

async function main() {
  const corsRules = {
    CORSRules: [
      {
        // Public read of card/photo assets (presigned GET)
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedOrigins: ['*'],
        ExposeHeaders: ['ETag', 'Content-Length'],
        MaxAgeSeconds: 3000
      },
      {
        // Direct browser photo upload via presigned PUT (web scale)
        AllowedHeaders: ['*'],
        AllowedMethods: ['PUT'],
        AllowedOrigins: [
          'https://tnbjp.org',
          'https://www.tnbjp.org',
          'https://tamilnadubjp.live',
          'https://www.tamilnadubjp.live',
        ],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3000
      }
    ]
  };

  console.log(`Setting CORS on bucket: ${config.B2_BUCKET_NAME}...`);
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: config.B2_BUCKET_NAME,
      CORSConfiguration: corsRules
    }));
    console.log("CORS configured successfully on Backblaze B2!");
  } catch (err) {
    console.error("Failed to set CORS on B2 bucket:", err);
  }
}
main();
