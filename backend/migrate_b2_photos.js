const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// Old Backblaze B2 credentials
const oldS3 = new S3Client({
  endpoint: 'https://s3.us-east-005.backblazeb2.com',
  region: 'us-east-005',
  credentials: {
    accessKeyId: '00523751115d6810000000004',
    secretAccessKey: 'K0057uKncMfE+e9zbwQXXUFTfuYvpOc'
  },
  forcePathStyle: true
});
const OLD_BUCKET = 'bjpmembers';

// New Backblaze B2 credentials
const newS3 = new S3Client({
  endpoint: 'https://s3.us-east-005.backblazeb2.com',
  region: 'us-east-005',
  credentials: {
    accessKeyId: '005809cc3d3f6960000000002',
    secretAccessKey: 'K005DXt13auQh5jew5t3L5tHQrtSnrQ'
  },
  forcePathStyle: true
});
const NEW_BUCKET = 'bjpmembership';

// Helper to stream helper function to buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function runMigration() {
  console.log(`Starting migration from ${OLD_BUCKET} to ${NEW_BUCKET}...`);
  
  let continuationToken = undefined;
  let totalCount = 0;
  let copiedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  do {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: OLD_BUCKET,
        ContinuationToken: continuationToken
      });
      const listResponse = await oldS3.send(listCommand);
      
      const contents = listResponse.Contents || [];
      if (contents.length === 0) {
        console.log('No files found in the old bucket.');
        break;
      }
      
      console.log(`Found ${contents.length} files in this batch. Processing...`);

      for (const file of contents) {
        const key = file.Key;
        totalCount++;
        
        try {
          // Check if file already exists in the new bucket
          try {
            await newS3.send(new HeadObjectCommand({ Bucket: NEW_BUCKET, Key: key }));
            // If it succeeds, the file already exists in the new bucket
            // console.log(`[SKIPPED] ${key} already exists in new bucket.`);
            skippedCount++;
            continue;
          } catch (headErr) {
            // File does not exist, proceed to copy
          }

          console.log(`[COPYING] ${key} (${(file.Size / 1024).toFixed(1)} KB)...`);
          
          // Download file
          const getResponse = await oldS3.send(new GetObjectCommand({ Bucket: OLD_BUCKET, Key: key }));
          const buffer = await streamToBuffer(getResponse.Body);
          
          // Upload file
          await newS3.send(new PutObjectCommand({
            Bucket: NEW_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: getResponse.ContentType || 'image/jpeg',
            CacheControl: 'public, max-age=31536000, immutable'
          }));
          
          console.log(`[SUCCESS] Copied ${key}`);
          copiedCount++;
        } catch (fileErr) {
          console.error(`[FAILED] Copying ${key} failed:`, fileErr.message);
          failedCount++;
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } catch (batchErr) {
      console.error('Error listing batch of objects from old bucket:', batchErr.message);
      break;
    }
  } while (continuationToken);

  console.log('\nMigration Summary:');
  console.log(`- Total Files in source: ${totalCount}`);
  console.log(`- Successfully copied:  ${copiedCount}`);
  console.log(`- Already existed:      ${skippedCount}`);
  console.log(`- Failed to copy:        ${failedCount}`);
}

runMigration();
