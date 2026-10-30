const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'ap-southeast-1' });
const dynamo = DynamoDBDocumentClient.from(client);
const TABLE = 'reviews';

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path;
  const body = event.body ? JSON.parse(event.body) : {};
  const params = event.pathParameters || {};

  try {
    // POST /api/reviews
    if (method === 'POST') {
      const { review_id, event_id, user_id, rating, comment } = body;

      if (!review_id || !event_id || !user_id || rating === undefined || !comment) {
        return respond(400, { message: 'Missing required fields: review_id, event_id, user_id, rating, and comment are all required.' });
      }
      if (rating < 1 || rating > 5) {
        return respond(400, { message: 'Rating must be between 1 and 5' });
      }

      const existing = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'event_id = :eid',
        FilterExpression: 'user_id = :uid',
        ExpressionAttributeValues: { ':eid': event_id, ':uid': user_id }
      }));
      if (existing.Items && existing.Items.length > 0) {
        return respond(409, { message: 'You have already reviewed this event' });
      }

      await dynamo.send(new PutCommand({
        TableName: TABLE,
        Item: {
          event_id,
          review_id,
          user_id,
          rating,
          comment,
          created_at: new Date().toISOString()
        }
      }));
      return respond(201, { message: 'Review posted' });
    }

    // GET /api/reviews/event/{eventId}
    if (method === 'GET' && path.includes('/event/')) {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'event_id = :eid',
        ExpressionAttributeValues: { ':eid': params.eventId }
      }));
      return respond(200, result.Items);
    }

    // GET /api/reviews/{id}
    if (method === 'GET' && params.id && !path.includes('/event/')) {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'review_id-index',
        KeyConditionExpression: 'review_id = :rid',
        ExpressionAttributeValues: { ':rid': params.id }
      }));
      if (!result.Items || result.Items.length === 0) return respond(404, { message: 'Review not found' });
      return respond(200, result.Items[0]);
    }

    // PUT /api/reviews/{id}
    if (method === 'PUT' && params.id) {
      const { rating, comment, event_id } = body;

      if (!event_id || rating === undefined || !comment) {
        return respond(400, { message: 'Missing required fields: event_id, rating, and comment are all required.' });
      }
      if (rating < 1 || rating > 5) {
        return respond(400, { message: 'Rating must be between 1 and 5' });
      }

      // Confirm the review actually exists before updating
      const existing = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'event_id = :eid AND review_id = :rid',
        ExpressionAttributeValues: { ':eid': event_id, ':rid': params.id }
      }));
      if (!existing.Items || existing.Items.length === 0) {
        return respond(404, { message: 'Review not found' });
      }

      await dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { event_id, review_id: params.id },
        UpdateExpression: 'SET rating = :r, #c = :c, updated_at = :u',
        ExpressionAttributeNames: {
          '#c': 'comment'
        },
        ExpressionAttributeValues: {
          ':r': rating,
          ':c': comment,
          ':u': new Date().toISOString()
        }
      }));
      return respond(200, { message: 'Review updated' });
    }

    // DELETE /api/reviews/{id}
    if (method === 'DELETE' && params.id) {
      const { event_id } = body;

      if (!event_id) {
        return respond(400, { message: 'event_id is required in the request body to identify which review to delete.' });
      }

      const existing = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'event_id = :eid AND review_id = :rid',
        ExpressionAttributeValues: { ':eid': event_id, ':rid': params.id }
      }));
      if (!existing.Items || existing.Items.length === 0) {
        return respond(404, { message: 'Review not found' });
      }

      await dynamo.send(new DeleteCommand({
        TableName: TABLE,
        Key: { event_id, review_id: params.id }
      }));
      return respond(200, { message: 'Review deleted' });
    }

    return respond(404, { message: 'Route not found' });

  } catch (err) {
    return respond(500, { message: 'Server error', error: err.message });
  }
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}