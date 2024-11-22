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
import { StepFunctionsStack } from './step-functions/step-functions';


interface LambdaFunctionStackProps {  
  readonly wsApiEndpoint : string;  
  readonly sessionTable : Table;  
  readonly feedbackTable : Table;
  readonly feedbackBucket : s3.Bucket;
  readonly knowledgeBucket : s3.Bucket;
  readonly knowledgeBase : bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
  readonly evalSummariesTable : Table;
  readonly evalResutlsTable : Table;
  readonly evalTestCasesBucket : s3.Bucket;
  readonly stagedSystemPromptsTable : Table;
  readonly activeSystemPromptsTable : Table;
}

export class LambdaFunctionStack extends cdk.Stack {  
  public readonly chatFunction : lambda.Function;
  public readonly sessionFunction : lambda.Function;
  public readonly feedbackFunction : lambda.Function;
  public readonly deleteS3Function : lambda.Function;
  public readonly getS3KnowledgeFunction : lambda.Function;
  public readonly getS3TestCasesFunction : lambda.Function;
  public readonly uploadS3KnowledgeFunction : lambda.Function;
  public readonly uploadS3TestCasesFunction : lambda.Function;
  public readonly syncKBFunction : lambda.Function;
  public readonly kbSyncWrapperFunction : lambda.Function;
  public readonly onetDataPullFunction : lambda.Function;
  public readonly blsDataTransformFunction : lambda.Function;
  public readonly handleEvalResultsFunction : lambda.Function;
  public readonly stepFunctionsStack : StepFunctionsStack;
  public readonly systemPromptsFunction : lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);
    
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

    const systemPromptsAPIHandlerFunction = new lambda.Function(scope, 'SystemPromptsHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/system-prompt-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "STAGED_SYSTEM_PROMPTS_TABLE" : props.stagedSystemPromptsTable.tableName, 
        "ACTIVE_SYSTEM_PROMPTS_TABLE" : props.activeSystemPromptsTable.tableName,
        "DEFAULT_PROMPT" : `You are a helpful AI chatbot that will answer questions based on your knowledge. 
        You have access to a search tool that you will use to look up answers to questions. You must 
        respond to the user in the same language as their question. Your goal is to help prospective 
        students research how courses and programs at specific MA public higher education institutions 
        can set them up for fulfilling careers. You have knowledge about career outlooks, the day to day 
        tasks for careers, and the skills required for careers. You also have knowledge about the skills 
        that courses and programs teach. You only know about Greenfield Community College (GCC), Bridgewater 
        State University (BSU), and Worcester State University (WSU). You do not have knowledge about and 
        cannot answer questions about any other institutions. If something is not in your knowledge base, 
        do not assume it does not exist. Simply inform the user you don't have knowledge of it.`
       }
    });
    // Add permissions to the lambda function to read/write to the table
    systemPromptsAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.activeSystemPromptsTable.tableArn, props.activeSystemPromptsTable.tableArn + "/index/*", props.stagedSystemPromptsTable.tableArn, props.stagedSystemPromptsTable.tableArn + "/index/*"]
    }));
    this.systemPromptsFunction = systemPromptsAPIHandlerFunction;
    props.activeSystemPromptsTable.grantReadWriteData(systemPromptsAPIHandlerFunction);
    props.stagedSystemPromptsTable.grantReadWriteData(systemPromptsAPIHandlerFunction);

        // Define the Lambda function resource
        const websocketAPIFunction = new lambda.Function(scope, 'ChatHandlerFunction', {
          runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
          code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-chat')), // Points to the lambda directory
          handler: 'index.handler', // Points to the 'hello' file in the lambda directory
          environment : {
            "WEBSOCKET_API_ENDPOINT" : props.wsApiEndpoint.replace("wss","https"),            
            'KB_ID' : props.knowledgeBase.attrKnowledgeBaseId,
            'SESSION_HANDLER' : sessionAPIHandlerFunction.functionName,
            'SYSTEM_PROMPTS_HANDLER' : systemPromptsAPIHandlerFunction.functionName
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
          resources: [this.sessionFunction.functionArn, this.systemPromptsFunction.functionArn]
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

    const getS3KnowledgeAPIHandlerFunction = new lambda.Function(scope, 'GetS3KnowledgeFilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/get-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    getS3KnowledgeAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.getS3KnowledgeFunction = getS3KnowledgeAPIHandlerFunction;

    const getS3TestCasesAPIHandlerFunction = new lambda.Function(scope, 'GetS3TestCasesFilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'llm-eval/S3-get-test-cases')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.evalTestCasesBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    getS3TestCasesAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.evalTestCasesBucket.bucketArn,props.evalTestCasesBucket.bucketArn+"/*"]
    }));
    this.getS3TestCasesFunction = getS3TestCasesAPIHandlerFunction;

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

    const uploadS3KnowledgeAPIHandlerFunction = new lambda.Function(scope, 'UploadS3KnowledgeFilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/upload-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    uploadS3KnowledgeAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.uploadS3KnowledgeFunction = uploadS3KnowledgeAPIHandlerFunction;

    const uploadS3TestCasesFunction = new lambda.Function(scope, 'UploadS3TestCasesFilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'llm-eval/S3-upload')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.evalTestCasesBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    uploadS3TestCasesFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.evalTestCasesBucket.bucketArn,props.evalTestCasesBucket.bucketArn+"/*"]
    }));
    this.uploadS3TestCasesFunction = uploadS3TestCasesFunction;


    // define secret to store O*NET API key
    const onetApiKeySecret = secretsmanager.Secret.fromSecretNameV2(this, 'OnetApiKey', 'ONET_API_Credentials');

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

    const evalResultsAPIHandlerFunction = new lambda.Function(scope, 'EvalResultsHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'llm-eval/eval-results-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "EVALUATION_RESULTS_TABLE" : props.evalResutlsTable.tableName,
        "EVALUATION_SUMMARIES_TABLE" : props.evalSummariesTable.tableName
      }
    });
    evalResultsAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({ 
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.evalResutlsTable.tableArn, props.evalResutlsTable.tableArn + "/index/*", props.evalSummariesTable.tableArn, props.evalSummariesTable.tableArn + "/index/*"]
    }));
    this.handleEvalResultsFunction = evalResultsAPIHandlerFunction;
    props.evalResutlsTable.grantReadWriteData(evalResultsAPIHandlerFunction);
    props.evalSummariesTable.grantReadWriteData(evalResultsAPIHandlerFunction);

    this.stepFunctionsStack = new StepFunctionsStack(scope, 'StepFunctionsStack', {
      knowledgeBase: props.knowledgeBase,
      evalSummariesTable: props.evalSummariesTable,
      evalResutlsTable: props.evalResutlsTable,
      evalTestCasesBucket: props.evalTestCasesBucket,
      systemPromptsHandlerName: systemPromptsAPIHandlerFunction.functionName
    });

  }
}
