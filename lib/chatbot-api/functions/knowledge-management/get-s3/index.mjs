// Import necessary modules
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const s3Client = new S3Client();    
  try {
    const claims = event.requestContext.authorizer.jwt.claims
    const roles = JSON.parse(claims['custom:role'])
    if (roles.includes("MasterAdmin")) {
      console.log("MasterAdmin Authorized")
    } else if (roles.includes("Admin")) {  
      console.log("Institutional Admin Authorized")    
    } else {
      console.log("not an admin")
      return {
        statusCode: 403,
         headers: {
              'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({message: 'User is not authorized to perform this action'}),
      };
    }
  } catch (e) {
    console.log("could not check admin access")
    console.log(e)
    return {
      statusCode: 500,
       headers: {
            'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({message: 'Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute.'}),
    };
  }
  const {continuationToken, pageIndex } = event;
  const s3Bucket = process.env.BUCKET;
  
  
  
  try {
    const claims = event.requestContext.authorizer.jwt.claims
    const roles = JSON.parse(claims['custom:role'])
    if (roles.includes("MasterAdmin")) {
      // No need for prefixes, list all objects in the bucket
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        
        ContinuationToken: continuationToken,
      });
      const result = await s3Client.send(command);
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(result),
      };

    } else {
      const institutions = JSON.parse(claims['custom:institution'])
      console.log("regular Admin")
      // For regular Admins, restrict access to institution-specific directories
      const institution = institutions[0];
      const prefixes = [`archive/${institution}/`, `raw/${institution}/`, `processed/${institution}/`, `current/${institution}/`];

      // Iterate over each prefix and accumulate results
      for (const prefix of prefixes) {
        const command = new ListObjectsV2Command({
          Bucket: s3Bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,  // Apply continuationToken for each prefix
        });

        const result_temp = await s3Client.send(command);
        result = result.concat(result_temp.Contents || []);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(result),
        };
      }
    }
  } catch (error) {
    return {
      statusCode: 500,
       headers: {
            'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({message: 'Get S3 Bucket data failed- Internal Server Error'}),
    };
  }
};
