import { AdminDataType } from "../../common/types";
import { DateTime } from "luxon";
import { Utils } from "../../common/utils";
import { Button } from "@cloudscape-design/components";
import { useNavigate } from "react-router-dom";
import React from "react";


function ViewDetailsButton({ evaluationId }) {
  const navigate = useNavigate();
  console.log("evaluationId: ", evaluationId);

  const viewDetailedEvaluation = (evaluationId) => {
    navigate(`/admin/llm-evaluation/${evaluationId}`);
  };

  return (
    <Button onClick={() => viewDetailedEvaluation(evaluationId)} variant="link">
      View Details
    </Button>
  );
}


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
    id: "evalTestCaseKey",
    header: "Test Case Filename",
    cell: (item) => item.test_case_key || "Unnamed Test Case",
    sortingField: "test_case_key",
  },
  {
    id: "timestamp",
    header: "Timestamp",
    //cell: (item) => new Date(item.timestamp).toLocaleString(),
    cell: (item) =>
      DateTime.fromISO(new Date(item.Timestamp).toISOString()).toLocaleString(
        DateTime.DATETIME_SHORT
      ),
    sortingField: "Timestamp",
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
    header: "View Details",
    cell: (item) => <ViewDetailsButton evaluationId={item.EvaluationId}/>,
  }, 
];

const DETAILED_EVAL_COLUMN_DEFINITIONS = [
  {
    id: "question",
    header: "Question",
    cell: (item) => item.question,
  },
  {
    id: "expectedResponse",
    header: "Expected Response",
    cell: (item) => item.expected_response,
  },
  {
    id: "actualResponse",
    header: "Actual Response",
    cell: (item) => item.actual_response,
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
