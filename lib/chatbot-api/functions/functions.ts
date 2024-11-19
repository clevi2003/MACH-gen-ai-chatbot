import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
//import { LambdaLayerStack } from '../../layers/index';

// Import Lambda L2 construct
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3_notifications from "aws-cdk-lib/aws-s3-notifications";
import * as bedrock from "aws-cdk-lib/aws-bedrock";

interface LambdaFunctionStackProps {  
  readonly wsApiEndpoint : string;  
  readonly sessionTable : Table;  
  readonly feedbackTable : Table;
  readonly feedbackBucket : s3.Bucket;
  readonly knowledgeBucket : s3.Bucket;
  readonly knowledgeBase : bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
}

export class LambdaFunctionStack extends cdk.Stack {  
  public readonly chatFunction : lambda.Function;
  public readonly sessionFunction : lambda.Function;
  public readonly feedbackFunction : lambda.Function;
  public readonly deleteS3Function : lambda.Function;
  public readonly getS3Function : lambda.Function;
  public readonly uploadS3Function : lambda.Function;
  public readonly syncKBFunction : lambda.Function;
  public readonly onetDataPullFunction : lambda.Function;
  public readonly blsDataTransformFunction : lambda.Function;
  public readonly ossUpdateIndexFunction : lambda.Function;
  public readonly kbSyncWrapperFunction : lambda.Function;
  public readonly gccfunc : lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);
    
    //const layer = new LambdaLayerStack(this, 'LambdaLayerStack');
    //this.layer = layer;

    const gccAPIHandlerFunction = new lambda.Function(scope, 'GCCHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'GCC-clean')),
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName
      },
      timeout: cdk.Duration.seconds(300)
    });
    // S3 bucket permissions
    gccAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    // texttract permissions
    gccAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'textract:*'
      ],
      resources: ["*"]
    }));
    this.gccfunc = gccAPIHandlerFunction;
    
    const sessionAPIHandlerFunction = new lambda.Function(scope, 'SessionHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "DDB_TABLE_NAME" : props.sessionTable.tableName
      },
      timeout: cdk.Duration.seconds(30)
    });
    
    sessionAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.sessionTable.tableArn, props.sessionTable.tableArn + "/index/*"]
    }));

    this.sessionFunction = sessionAPIHandlerFunction;

        // Define the Lambda function resource
        const websocketAPIFunction = new lambda.Function(scope, 'ChatHandlerFunction', {
          runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
          code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-chat')), // Points to the lambda directory
          handler: 'index.handler', // Points to the 'hello' file in the lambda directory
          environment : {
            "WEBSOCKET_API_ENDPOINT" : props.wsApiEndpoint.replace("wss","https"),            
            "PROMPT" : `You are a helpful AI chatbot that will answer questions based on your knowledge. 
            You have access to a search tool that you will use to look up answers to questions. You must 
            respond to the user in the same language as their question. Your goal is to help prospective 
            students research how courses and programs at specific MA public higher education institutions 
            can set them up for fulfilling careers. You have knowledge about career outlooks, the day to day 
            tasks for careers, and the skills required for careers. You also have knowledge about the skills 
            that courses and programs teach. You only know about Greenfield Community College (GCC), Bridgewater 
            State University (BSU), and Worcester State University (WSU). You do not have knowledge about and 
            cannot answer questions about any other institutions. If something is not in your knowledge base, 
            do not assume it does not exist. Simply inform the user you don't have knowledge of it.`,
            'KB_ID' : props.knowledgeBase.attrKnowledgeBaseId,
            'CONFL_PROMPT': `You are a knowledge expert looking to either identify conflicts among the 
            above documents or assure the user that no conflicts exist. You are not looking for small 
            syntatic or grammatical differences, but rather pointing out major factual inconsistencies. 
            You can be confident about identifying a conflict between two documents if the conflict 
            represents a major factual difference that would result in semantic differences between 
            responses constructed with each respective decoment. If conflicts are detected, please format 
            them in an organized list where each entry includes the names of the conflicting documents as 
            well as the conflicting statements. If there is no conflict please respond only with "no 
            conflicts detected" Do not include any additional information. Only include identified 
            conflicts that you are confident are factual inconsistencies. Do not include identified 
            conflicts that you are not confident are real conflicts.`
          },
          timeout: cdk.Duration.seconds(300)
        });
        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:InvokeModel',
            
          ],
          resources: ["*"]
        }));
        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:Retrieve'
          ],
          resources: [props.knowledgeBase.attrKnowledgeBaseArn]
        }));

        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:InvokeFunction'
          ],
          resources: [this.sessionFunction.functionArn]
        }));
        // give permission for cloudwatch to log the function
        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          resources: ["arn:aws:logs:region:account-id:log-group:/aws/lambda/your-function-name:*"]
        }));
        //give permission for comprehend and translate to be used by the function
        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'comprehend:*',
            'translate:*'
          ],
          resources: ["*"]
        }));
        this.chatFunction = websocketAPIFunction;

    const feedbackAPIHandlerFunction = new lambda.Function(scope, 'FeedbackHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'feedback-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "FEEDBACK_TABLE" : props.feedbackTable.tableName,
        "FEEDBACK_S3_DOWNLOAD" : props.feedbackBucket.bucketName
      },
      timeout: cdk.Duration.seconds(30)
    });
    
    feedbackAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.feedbackTable.tableArn, props.feedbackTable.tableArn + "/index/*"]
    }));

    feedbackAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.feedbackBucket.bucketArn,props.feedbackBucket.bucketArn+"/*"]
    }));

    this.feedbackFunction = feedbackAPIHandlerFunction;
    
    const deleteS3APIHandlerFunction = new lambda.Function(scope, 'DeleteS3FilesHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/delete-s3')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    deleteS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.deleteS3Function = deleteS3APIHandlerFunction;

    const getS3APIHandlerFunction = new lambda.Function(scope, 'GetS3FilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/get-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    getS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.getS3Function = getS3APIHandlerFunction;

    const kbSyncAPIHandlerFunction = new lambda.Function(scope, 'SyncKBHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/kb-sync')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "KB_ID" : props.knowledgeBase.attrKnowledgeBaseId,      
        "SOURCE" : props.knowledgeBaseSource.attrDataSourceId,
        "TRIGGER_BUCKET" : props.knowledgeBucket.bucketName,  
        "TRIGGER_KEY" : "triggers/aoss_sync.trigger"
      },
      timeout: cdk.Duration.seconds(30)
    });

    kbSyncAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:*'
      ],
      resources: [props.knowledgeBase.attrKnowledgeBaseArn]
    }));
    this.syncKBFunction = kbSyncAPIHandlerFunction;

    // add S3 notification so index update function is triggered by triggers/aoss_sync.trigger
    //props.knowledgeBucket.addEventNotification(s3.EventType.OBJECT_CREATED, 
    //  new s3_notifications.LambdaDestination(ossUpdateIndexFunction), {
    //    prefix: 'triggers',
    //    suffix: 'aoss_sync.trigger' 
    //  }
    //);

    //const ossUpdateIndexAPIHandlerFunction = new lambda.Function(scope, 'OSSUpdateIndexHandlerFunction', {
    //  runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
    //  code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/oss-update-index')), // Points to the lambda directory
    //  handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
    //  environment: {
    //    "KB_ID" : props.knowledgeBase.attrKnowledgeBaseId,      
    //    "SOURCE" : props.knowledgeBaseSource.attrDataSourceId
    //  },
    //  timeout: cdk.Duration.seconds(30)
    //});

    const uploadS3APIHandlerFunction = new lambda.Function(scope, 'UploadS3FilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/upload-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    uploadS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.uploadS3Function = uploadS3APIHandlerFunction;

    // define secret to store O*NET API key
    const onetApiKeySecret = secretsmanager.Secret.fromSecretNameV2(this, 'OnetApiKey', 'ONET_API_Credentials');
    //const onetApiKeySecret = new secretsmanager.Secret(this, 'OnetApiKey', {
    //  secretName: 'ONET_API_Credentials',
    //  description: 'Credentials for O*NET API',
    //  removalPolicy: cdk.RemovalPolicy.DESTROY
    //});

    const onetDataPullHandlerFunction = new lambda.Function(scope, 'OnetDataPullHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'onet-data-pull')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName, 
        "SECRET_NAME" : 'ONET_API_Credentials', //onetApiKeySecret.secretName,       
      },
      timeout: cdk.Duration.seconds(900),
      //layers: [props.layer]
    });
    // add IAM policy to allow access to S3 bucket
    onetDataPullHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    // give lambda function access to the secret
    // onetApiKeySecret.grantRead(onetDataPullHandlerFunction);
    // give lambda function IAM access to secret
    const secretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:ONET_API_Credentials-*`;
    onetDataPullHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      // resources: [onetApiKeySecret.secretArn]
      resources: [secretArn]
    }));
    this.onetDataPullFunction = onetDataPullHandlerFunction;

    // create EventBridge rule to trigger data pull twice a year
    const onetDataPullScheduleRule = new events.Rule(this, 'OnetDataPullScheduleRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '0',
        month: '1,7',
        year: '*',
        weekDay: 'MON'
      }),
      description: 'Schedule to pull data from O*NET API twice a year'
    });
    // give eventbridge rule access to invoke lambda function
    onetDataPullHandlerFunction.grantInvoke

    // add lambda function as target to the rule
    onetDataPullScheduleRule.addTarget(new targets.LambdaFunction(this.onetDataPullFunction));

    // add lambda function to transform bls data and put transformed data in current folder
    const blsDataTransformHandlerFunction = new lambda.Function(scope, 'BlsDataTransformHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'bls-data-transform')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(300),
    });

    blsDataTransformHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));

    this.blsDataTransformFunction = blsDataTransformHandlerFunction;

    // Add S3 event notification to trigger Lambda function when the marker file is uploaded
    props.knowledgeBucket.addEventNotification(s3.EventType.OBJECT_CREATED, 
      new s3_notifications.LambdaDestination(this.blsDataTransformFunction), {
        prefix: 'raw/bls_data_v',
        suffix: 'process.trigger' 
        //prefix: "triggers/",
        //suffix: "bls_data_transform.trigger"
      }
    );

    // add lambda function wrapper to trigger kb sync after onet and bls S3 data uploads
    // Define the wrapper Lambda function
    const kbSyncWrapperFunction = new lambda.Function(scope, 'KBSyncWrapperFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/kb-sync-trigger')), // Path to your wrapper function code
      handler: 'lambda_function.lambda_handler',
      environment: {
        'SYNC_FUNCTION_NAME': this.syncKBFunction.functionName, // Pass the name of the sync function
      },
      timeout: cdk.Duration.seconds(30),
    });
    // grant the wrapper function permission to invoke the sync function
    kbSyncWrapperFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction',
      ],
      resources: [this.syncKBFunction.functionArn],
    }));
    this.kbSyncWrapperFunction = kbSyncWrapperFunction;
    // add S3 event notification for when anything is added to current folder
    props.knowledgeBucket.addEventNotification(s3.EventType.OBJECT_CREATED, 
      new s3_notifications.LambdaDestination(this.kbSyncWrapperFunction), {
        prefix: 'current/',
        suffix: ''
      }
    );
  }
}
