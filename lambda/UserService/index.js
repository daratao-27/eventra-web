const mysql = require('mysql2/promise');
const { CognitoIdentityProviderClient, SignUpCommand, InitiateAuthCommand, ConfirmSignUpCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient({ region: 'ap-southeast-1' });
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

let pool;

exports.handler = async (event) => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: 'eventra_db',
      port: 3306
    });
  }

  const method = event.httpMethod;
  const path = event.path;
  const body = event.body ? JSON.parse(event.body) : {};
  const params = event.pathParameters || {};
  const query = event.queryStringParameters || {};

  try {

    // POST /api/users/register
    if (method === 'POST' && path.endsWith('/register')) {
      const { name, email, password, role } = body;

      if (!name || !email || !password || !role) {
        return respond(400, { message: 'Missing required fields: name, email, password, and role are all required.' });
      }
      if (role !== 'organizer' && role !== 'attendee') {
        return respond(400, { message: 'Role must be either "organizer" or "attendee".' });
      }

      const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return respond(409, { message: 'An account with this email already exists.' });
      }

      try {
        await cognito.send(new SignUpCommand({
          ClientId: CLIENT_ID,
          Username: email,
          Password: password,
          UserAttributes: [
            { Name: 'name', Value: name },
            { Name: 'email', Value: email }
          ]
        }));
      } catch (cognitoErr) {
        if (cognitoErr.name === 'UsernameExistsException') {
          return respond(409, { message: 'An account with this email already exists in Cognito.' });
        }
        if (cognitoErr.name === 'InvalidPasswordException') {
          return respond(400, { message: 'Password does not meet complexity requirements.' });
        }
        throw cognitoErr;
      }

      const [result] = await pool.query(
        'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
        [name, email, role]
      );
      return respond(201, { message: 'User registered successfully. Please check your email to confirm your account.', user_id: result.insertId });
    }

    // POST /api/users/confirm
    if (method === 'POST' && path.endsWith('/confirm')) {
      const { email, code } = body;
      if (!email || !code) {
        return respond(400, { message: 'Email and code are required.' });
      }
      try {
        await cognito.send(new ConfirmSignUpCommand({
          ClientId: CLIENT_ID,
          Username: email,
          ConfirmationCode: code
        }));
      } catch (cognitoErr) {
        if (cognitoErr.name === 'CodeMismatchException') {
          return respond(400, { message: 'Invalid confirmation code.' });
        }
        if (cognitoErr.name === 'ExpiredCodeException') {
          return respond(400, { message: 'Confirmation code has expired.' });
        }
        throw cognitoErr;
      }
      return respond(200, { message: 'Account confirmed successfully!' });
    }

    // POST /api/users/login
    if (method === 'POST' && path.endsWith('/login')) {
      const { email, password } = body;

      if (!email || !password) {
        return respond(400, { message: 'Email and password are required.' });
      }

      let authResult;
      try {
        authResult = await cognito.send(new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: CLIENT_ID,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password
          }
        }));
      } catch (cognitoErr) {
        if (cognitoErr.name === 'NotAuthorizedException' || cognitoErr.name === 'UserNotFoundException') {
          return respond(401, { message: 'Incorrect email or password.' });
        }
        if (cognitoErr.name === 'UserNotConfirmedException') {
          return respond(403, { message: 'Account not confirmed. Please check your email for a confirmation code.' });
        }
        throw cognitoErr;
      }

      const [rows] = await pool.query(
        'SELECT user_id, name, email, role FROM users WHERE email = ?',
        [email]
      );

      return respond(200, {
        message: 'Login successful',
        token: authResult.AuthenticationResult.IdToken,
        user: rows[0]
      });
    }

    // POST /api/users/forgot-password
    if (method === 'POST' && path.endsWith('/forgot-password')) {
      const { email } = body;
      if (!email) {
        return respond(400, { message: 'Email is required.' });
      }
      try {
        await cognito.send(new ForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: email
        }));
      } catch (cognitoErr) {
        if (cognitoErr.name === 'UserNotFoundException') {
          return respond(404, { message: 'No account found with this email.' });
        }
        throw cognitoErr;
      }
      return respond(200, { message: 'Password reset code sent to your email.' });
    }

    // POST /api/users/reset-password
    if (method === 'POST' && path.endsWith('/reset-password')) {
      const { email, code, newPassword } = body;
      if (!email || !code || !newPassword) {
        return respond(400, { message: 'Email, code, and newPassword are required.' });
      }
      try {
        await cognito.send(new ConfirmForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: email,
          ConfirmationCode: code,
          Password: newPassword
        }));
      } catch (cognitoErr) {
        if (cognitoErr.name === 'CodeMismatchException') {
          return respond(400, { message: 'Invalid reset code.' });
        }
        if (cognitoErr.name === 'InvalidPasswordException') {
          return respond(400, { message: 'New password does not meet complexity requirements.' });
        }
        throw cognitoErr;
      }
      return respond(200, { message: 'Password reset successfully!' });
    }

    // GET /api/users
    if (method === 'GET' && !params.id) {
      let sql = 'SELECT user_id, name, email, role, created_at FROM users';
      const sqlParams = [];
      if (query.name) {
        sql += ' WHERE name LIKE ?';
        sqlParams.push(`%${query.name}%`);
      }
      const [rows] = await pool.query(sql, sqlParams);
      return respond(200, rows);
    }

    // GET /api/users/{id}
    if (method === 'GET' && params.id) {
      if (isNaN(params.id)) {
        return respond(400, { message: 'User ID must be a number.' });
      }
      const [rows] = await pool.query(
        'SELECT user_id, name, email, role, created_at FROM users WHERE user_id = ?',
        [params.id]
      );
      if (rows.length === 0) return respond(404, { message: 'User not found' });
      return respond(200, rows[0]);
    }

    // PUT /api/users/{id}
    if (method === 'PUT' && params.id) {
      const { name, email } = body;
      if (!name || !email) {
        return respond(400, { message: 'Name and email are required.' });
      }
      const [existingUser] = await pool.query('SELECT user_id FROM users WHERE user_id = ?', [params.id]);
      if (existingUser.length === 0) {
        return respond(404, { message: 'User not found' });
      }
      await pool.query(
        'UPDATE users SET name = ?, email = ? WHERE user_id = ?',
        [name, email, params.id]
      );
      return respond(200, { message: 'User updated successfully' });
    }

    // DELETE /api/users/{id}
    if (method === 'DELETE' && params.id) {
      const [rows] = await pool.query('SELECT email FROM users WHERE user_id = ?', [params.id]);
      if (rows.length === 0) return respond(404, { message: 'User not found' });

      const email = rows[0].email;

      try {
        await cognito.send(new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email
        }));
      } catch (cognitoErr) {
        if (cognitoErr.name !== 'UserNotFoundException') {
          throw cognitoErr;
        }
      }

      await pool.query('DELETE FROM users WHERE user_id = ?', [params.id]);
      return respond(200, { message: 'User deleted successfully' });
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