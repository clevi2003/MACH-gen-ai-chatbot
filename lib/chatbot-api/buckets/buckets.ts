import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from "constructs";

export class S3BucketStack extends cdk.Stack {
  public readonly knowledgeBucket: s3.Bucket;
  public readonly feedbackBucket: s3.Bucket;
  public readonly evalTestCasesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a new S3 bucket
    this.knowledgeBucket = new s3.Bucket(scope, 'KnowledgeSourceBucket', {      
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET,s3.HttpMethods.POST,s3.HttpMethods.PUT,s3.HttpMethods.DELETE],
        allowedOrigins: ['*'],      
        allowedHeaders: ["*"]
      }]
    });

    this.feedbackBucket = new s3.Bucket(scope, 'FeedbackDownloadBucket', {
      // bucketName: 'feedback-download',
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET,s3.HttpMethods.POST,s3.HttpMethods.PUT,s3.HttpMethods.DELETE],
        allowedOrigins: ['*'], 
        allowedHeaders: ["*"]     
      }]
    });

    this.evalTestCasesBucket = new s3.Bucket(scope, 'EvalTestCasesBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET,s3.HttpMethods.POST,s3.HttpMethods.PUT,s3.HttpMethods.DELETE],
        allowedOrigins: ['*'], 
        allowedHeaders: ["*"]     
      }]
    });

    // Create initial folders in the bucket for archived, current, raw, and processed data
    this.createInitialFolders(this.knowledgeBucket, ['archive/', 'current/', 'raw/', 'processed/']);
  }
  private createInitialFolders(bucket: s3.Bucket, folderPaths: string[]) {
    folderPaths.forEach(folder => {
      new cr.AwsCustomResource(this, `S3Folder${folder.replace('/', '')}`, {
        onCreate: {
          service: 'S3',
          action: 'putObject',
          parameters: {
            Bucket: bucket.bucketName,
            Key: folder,  // Adding a trailing slash to simulate a folder
            Body: '',     // Empty content
          },
          physicalResourceId: cr.PhysicalResourceId.of(`S3Folder${folder}`),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [bucket.bucketArn] })
      });
    });
  }
}
