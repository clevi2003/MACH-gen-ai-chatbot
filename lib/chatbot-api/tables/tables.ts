import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Attribute, AttributeType, Table, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';

export class TableStack extends Stack {
  public readonly historyTable : Table;
  public readonly feedbackTable : Table;
  public readonly evalResultsTable : Table;
  public readonly evalSummaryTable : Table;
  public readonly systemPromptsTable : Table;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Define the table
    const chatHistoryTable = new Table(scope, 'ChatHistoryTable', {
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      sortKey: { name: 'session_id', type: AttributeType.STRING },
    });

    // Add a global secondary index to sort ChatHistoryTable by time_stamp
    chatHistoryTable.addGlobalSecondaryIndex({
      indexName: 'TimeIndex',
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      sortKey: { name: 'time_stamp', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.historyTable = chatHistoryTable;

    // Define the second table (UserFeedbackTable)
    const userFeedbackTable = new Table(scope, 'UserFeedbackTable', {
      partitionKey: { name: 'Topic', type: AttributeType.STRING },
      sortKey: { name: 'CreatedAt', type: AttributeType.STRING },
    });

    // Add a global secondary index to UserFeedbackTable with partition key CreatedAt
    userFeedbackTable.addGlobalSecondaryIndex({
      indexName: 'CreatedAtIndex',
      partitionKey: { name: 'CreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    
    userFeedbackTable.addGlobalSecondaryIndex({
      indexName: 'AnyIndex',
      partitionKey: { name: 'Any', type: AttributeType.STRING },
      sortKey: { name: 'CreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.feedbackTable = userFeedbackTable;    

    const evalSummariesTable = new Table(scope, 'EvaluationSummariesTable', {
      partitionKey: { name: 'EvaluationId', type: AttributeType.STRING },
    });
    // add secondary index to sort EvaluationSummariesTable by Timestamp
    evalSummariesTable.addGlobalSecondaryIndex({
      indexName: 'TimestampIndex',
      partitionKey: { name: 'EvaluationId', type: AttributeType.STRING },
      sortKey: { name: 'Timestamp', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.evalSummaryTable = evalSummariesTable;

    const evalResultsTable = new Table(scope, 'EvaluationResultsTable', {
      partitionKey: { name: 'EvaluationId', type: AttributeType.STRING },
      sortKey: { name: 'QuestionId', type: AttributeType.STRING },
    });
    // add secondary index to sort EvaluationResultsTable by Question ID
    evalResultsTable.addGlobalSecondaryIndex({
      indexName: 'QuestionIndex',
      partitionKey: { name: 'EvaluationId', type: AttributeType.STRING },
      sortKey: { name: 'QuestionId', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.evalResultsTable = evalResultsTable;

    const systemPromptsTable = new Table(scope, 'SystemPromptsTable', {
      partitionKey: { name: 'PromptId', type: AttributeType.STRING },
      sortKey: { name: 'Timestamp', type: AttributeType.STRING }, 
    });
    this.systemPromptsTable = systemPromptsTable;

  }
}
