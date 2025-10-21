
import { 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

const s3Client = createS3Client();
const { bucketName, folderPrefix } = getBucketConfig();

export async function uploadFile(buffer: Buffer, fileName: string): Promise<string> {
  try {
    const key = `${folderPrefix}${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: getContentType(fileName),
    });

    await s3Client.send(command);
    return key; // Return the full S3 key (cloud_storage_path)
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw new Error('Failed to upload file');
  }
}

export async function downloadFile(key: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    // Generate a signed URL that expires in 1 hour
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw new Error('Failed to generate download URL');
  }
}

export async function deleteFile(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    throw new Error('Failed to delete file');
  }
}

export async function renameFile(oldKey: string, newKey: string): Promise<string> {
  try {
    // Get the object
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: oldKey,
    });
    const object = await s3Client.send(getCommand);

    if (!object.Body) {
      throw new Error('Object body is empty');
    }

    // Convert stream to buffer
    const buffer = Buffer.from(await object.Body.transformToByteArray());

    // Upload to new location
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: newKey,
      Body: buffer,
      ContentType: object.ContentType,
    });
    await s3Client.send(putCommand);

    // Delete old object
    await deleteFile(oldKey);

    return newKey;
  } catch (error) {
    console.error('Error renaming file:', error);
    throw new Error('Failed to rename file');
  }
}

function getContentType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
