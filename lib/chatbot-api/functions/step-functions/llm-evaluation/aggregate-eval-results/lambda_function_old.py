import logging

def lambda_handler(event, context):
    try:
        partial_results_list = event['partial_results_list']
        print("partial_results_list: ", partial_results_list)
        # partial_results_list = [pr['partial_results'] for pr in partial_results_wrapped]
        total_similarity = sum(pr['total_similarity'] for pr in partial_results_list)
        total_relevance = sum(pr['total_relevance'] for pr in partial_results_list)
        total_correctness = sum(pr['total_correctness'] for pr in partial_results_list)
        total_questions = sum(pr['num_test_cases'] for pr in partial_results_list)
        detailed_results = []
        for pr in partial_results_list:
            detailed_results.extend(pr['detailed_results'])
        # Compute averages
        average_similarity = total_similarity / total_questions if total_questions > 0 else 0
        average_relevance = total_relevance / total_questions if total_questions > 0 else 0
        average_correctness = total_correctness / total_questions if total_questions > 0 else 0
        # Return aggregated results
        return {
            'evaluation_id': event['evaluation_id'], 
            'evaluation_name': event['evaluation_name'],
            'average_similarity': average_similarity,
            'average_relevance': average_relevance,
            'average_correctness': average_correctness,
            'total_questions': total_questions,
            'detailed_results': detailed_results,
            'test_cases_key': event['test_cases_key']
        }
    except Exception as e:
        logging.error(f"Error in evaluation Lambda: {str(e)}")
        return {
            "status_code": 500,
            "error": str(e)
        }
