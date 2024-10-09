// Import necessary modules
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const s3Client = new S3Client();    
  try {
    const claims = event.requestContext.authorizer.jwt.claims
    const roles = JSON.parse(claims['custom:role'])
    console.log(roles)
    let institutions = [];
    console.log(institutions)
    if (roles.includes("MasterAdmin")) {
      console.log("authorized")
    } else if (roles.includes("Admin")) {  
      institutions = JSON.parse(claims['custom:institution'])
      console.log(institutions)    
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
    /*
    if (roles.includes("MasterAdmin")) {
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,        
        ContinuationToken: continuationToken,
      });
      const result = await s3Client.send(command);
    } else {
        const institution = institutions[0]
        const prefixes = [`archive/${institution}/`, `raw/${institution}/`, `processed/${institution}/`, `current/${institution}/`];
          let result = [];

          // Iterate over each prefix to gather results
          for (const prefix of prefixes) {
            const command = new ListObjectsV2Command({
              Bucket: s3Bucket,
              Prefix: prefix,  // Restrict access to institution-specific prefix
              ContinuationToken: event.continuationToken,
            });

            const result_temp = await s3Client.send(command);
            result = result.concat(result_temp.Contents || []);  // Accumulate all files
          }
    }
    
    let prefixes;
    if (roles.includes("MasterAdmin")) {
      prefixes = [`archive/`, `raw/`, `processed/`, `current/`];
    } else {
      const institution = institutions[0]
      prefixes = [`archive/${institution}/`, `raw/${institution}/`, `processed/${institution}/`, `current/${institution}/`];
    }
    const commands = prefixes.map(prefix => {
      return new ListObjectsV2Command({
        Bucket: s3Bucket,
        Prefix: prefix,  // Restrict access to institution-specific prefix
        ContinuationToken: continuationToken,
      });
    });
    // asynchronously pull all files
    const results = await Promise.all(commands.map(command => s3Client.send(command)));
    //accumulate all files
    const result = results.reduce((acc, result) => {
      return acc.concat(result.Contents || []);
      }, []);  // Accumulate all files
    return {
      statusCode: 200,
      headers: {
            'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result),
    }; */
    let prefixes;

    // For MasterAdmin, list everything in the bucket
    if (roles.includes("MasterAdmin")) {
      // No need for prefixes, list all objects in the bucket
      const command = new ListObjectsV2Command({
        Bucket: s3Bucket,
        ContinuationToken: continuationToken,
      });

      const result_temp = await s3Client.send(command);
      result = result_temp.Contents || [];

    } else {
      // For regular Admins, restrict access to institution-specific directories
      const institution = institutions[0];
      prefixes = [`archive/${institution}/`, `raw/${institution}/`, `processed/${institution}/`, `current/${institution}/`];

      // Iterate over each prefix and accumulate results
      for (const prefix of prefixes) {
        const command = new ListObjectsV2Command({
          Bucket: s3Bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,  // Apply continuationToken for each prefix
        });

        const result_temp = await s3Client.send(command);
        result = result.concat(result_temp.Contents || []);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(result),
    };
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
