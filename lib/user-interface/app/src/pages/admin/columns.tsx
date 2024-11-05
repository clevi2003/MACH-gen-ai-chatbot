import { AdminDataType } from "../../common/types";
import { DateTime } from "luxon";
import { Utils } from "../../common/utils";
import { Button } from "@cloudscape-design/components";


const FILES_COLUMN_DEFINITIONS = [
  {
    id: "name",
    header: "Name",
    cell: (item) => item.Key!,
    isRowHeader: true,
  },
  {
    id: "createdAt",
    header: "Upload date",
    cell: (item) =>
      DateTime.fromISO(new Date(item.LastModified).toISOString()).toLocaleString(
        DateTime.DATETIME_SHORT
      ),
  },
  {
    id: "size",
    header: "Size",
    cell: (item) => Utils.bytesToSize(item.Size!),
  },
];

const FEEDBACK_COLUMN_DEFINITIONS = [
  {
    id: "problem",
    header: "Problem",
    cell: (item) => item.Problem,
    isRowHeader: true,
  },
  {
    id: "topic",
    header: "Topic",
    cell: (item) => item.Topic,
    isRowHeader: true,
  },
  {
    id: "createdAt",
    header: "Submission date",
    cell: (item) =>
      DateTime.fromISO(new Date(item.CreatedAt).toISOString()).toLocaleString(
        DateTime.DATETIME_SHORT
      ),
  },
  {
    id: "prompt",
    header: "User Prompt",
    cell: (item) => item.UserPrompt,
    isRowHeader: true
  },
];

const EVAL_SUMMARY_COLUMN_DEFINITIONS = [
  {
    id: "evaluationName",
    header: "Evaluation Name",
    cell: (item) => item.evaluation_name || "Unnamed Evaluation",
    sortingField: "evaluation_name",
  },
  {
    id: "timestamp",
    header: "Timestamp",
    cell: (item) => new Date(item.timestamp).toLocaleString(),
    sortingField: "timestamp",
  },
  {
    id: "averageSimilarity",
    header: "Average Similarity",
    cell: (item) =>
      (
        parseFloat(item.average_similarity) 
      ).toFixed(2),
  },
  {
    id: "averageRelevance",
    header: "Average Relevance",
    cell: (item) =>
    (
      parseFloat(item.average_relevance) 
    ).toFixed(2),
  },
  {
    id: "averageCorrectness",
    header: "Average Correctness",
    cell: (item) =>
    (
      parseFloat(item.average_correctness) 
    ).toFixed(2),
  },
  {
    id: "viewDetails",
    header: "View Detailed Evaluation",
    cell: (item) => (
      <Button
        onClick={() => item.viewEvaluationDetails(item.evaluation_id)}
        variant="link"
      >
        View Details
      </Button>
    ),
  },
];

const DETAILED_EVAL_COLUMN_DEFINITIONS = [
  {
    id: "documentName",
    header: "Document Name",
    cell: (item) => item.document_name || "Unnamed Document",
    sortingField: "document_name",
  },
  {
    id: "similarity",
    header: "Similarity",
    cell: (item) =>
      (
        parseFloat(item.similarity) 
      ).toFixed(2),
  },
  {
    id: "relevance",
    header: "Relevance",
    cell: (item) =>
    (
      parseFloat(item.relevance) 
    ).toFixed(2),
  },
  {
    id: "correctness",
    header: "Correctness",
    cell: (item) =>
    (
      parseFloat(item.correctness) 
    ).toFixed(2),
  },
];

/** This is exposed as a function because the code that this is based off of
 * originally supported many more distinct file types.
 */
export function getColumnDefinition(documentType: AdminDataType) {
  switch (documentType) {
    case "file":
      return FILES_COLUMN_DEFINITIONS;   
    case "feedback":
      return FEEDBACK_COLUMN_DEFINITIONS;
    case "evaluationSummary":
      return EVAL_SUMMARY_COLUMN_DEFINITIONS;
    case "detailedEvaluation":
      return DETAILED_EVAL_COLUMN_DEFINITIONS;
    default:
      return [];
  }
}
