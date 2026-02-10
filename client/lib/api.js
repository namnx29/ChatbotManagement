/**
 * API Client Utility
 * Centralized API caller for backend communication
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Get the full avatar URL from relative path
 * @param {string} avatarPath - Relative avatar path (e.g., /uploads/avatars/...)
 * @returns {string} - Full avatar URL
 */
export function getAvatarUrl(avatarPath) {
  if (!avatarPath) {
    return null;
  }
  // If it already has http protocol, return as is
  if (avatarPath.startsWith('http')) {
    return avatarPath;
  }
  // If it's a relative path to /public folder (not /uploads), use it as-is
  if (avatarPath.startsWith('/avatar')) {
    return avatarPath;
  }
  // Otherwise prepend the API base URL (for /uploads paths)
  return `${API_BASE_URL}${avatarPath}`;
}

/**
 * Helper to parse fetch responses and handle non-JSON error payloads gracefully.
 */
async function parseResponse(response) {
  // Clone response if body has been used (for logging purposes)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json = await response.json();
      return json;
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      // If body was already consumed, we can't read it again
      if (response.bodyUsed) {
        return { success: false, message: 'Response body already consumed' };
      }
      throw e;
    }
  }
  // Attempt to read text body for better diagnostics
  const txt = await response.text();
  try {
    // If it's HTML (likely a redirect/login page), include it in error
    return { success: false, message: `Non-JSON response: ${txt.substring(0, 400)}` };
  } catch (e) {
    return { success: false, message: 'Non-JSON response' };
  }
}

/**
 * Make an API call to the backend
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} endpoint - API endpoint (e.g., '/register', '/login')
 * @param {object} data - Request body data (optional)
 * @returns {Promise<object>} - Response data
 * @throws {Error} - If the request fails
 */
export async function apiCall(method, endpoint, data = null) {
  try {
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    const url = `${API_BASE_URL}/api${endpoint}`;
    const response = await fetch(url, config);

    const result = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(result.message || `HTTP ${response.status}`);
      error.info = result;
      error.status = response.status;
      throw error;
    }

    return result;
  } catch (error) {
    console.error(`API Error [${method} ${endpoint}]:`, error);
    throw error;
  }
}

/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} confirmPassword - Confirm password
 * @param {string} fullName - User full name
 * @param {string} phone - User phone number (optional)
 * @returns {Promise<object>} - Registration response
 */
export async function registerUser(email, password, confirmPassword, fullName, phone = null) {
  return apiCall('POST', '/register', {
    email,
    password,
    confirmPassword,
    fullName,
    phone,
  });
}

/**
 * Login user
 * @param {string} emailOrUsername - User email or username
 * @param {string} password - User password
 * @returns {Promise<object>} - Login response with user data
 */
export async function loginUser(emailOrUsername, password) {
  return apiCall('POST', '/login', {
    email: emailOrUsername,
    password,
  });
}

/**
 * Verify email with token
 * @param {string} token - Verification token
 * @param {string} email - User email
 * @param {string} accountId - User account ID
 * @returns {Promise<object>} - Verification response
 */
export async function verifyEmail(token, email, accountId) {
  return apiCall('GET', `/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&accountId=${encodeURIComponent(accountId)}`);
}

/**
 * Resend verification email
 * @param {string} email - User email
 * @returns {Promise<object>} - Resend response
 */
export async function resendVerificationEmail(email) {
  return apiCall('POST', '/resend-verification', {
    email,
  });
}

/**
 * Get user verification status
 * @param {string} email - User email
 * @returns {Promise<object>} - User status response
 */
export async function getUserStatus(email) {
  return apiCall('GET', `/user-status?email=${encodeURIComponent(email)}`);
}

/**
 * Fetch user profile data
 * @param {string} accountId - User account ID
 * @returns {Promise<object>} - Profile data response
 */
export async function fetchProfile(accountId) {
  try {
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    };

    const url = `${API_BASE_URL}/api/user/profile`;
    const response = await fetch(url, config);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [GET /user/profile]:', error);
    throw error;
  }
}

/**
 * Upload user avatar
 * @param {string} accountId - User account ID
 * @param {File} file - Avatar image file
 * @returns {Promise<object>} - Upload response with avatar URL
 */
export async function uploadAvatar(accountId, file) {
  try {
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('accountId', accountId);

    const response = await fetch(`${API_BASE_URL}/api/user/avatar`, {
      method: 'POST',
      headers: {
        'X-Account-Id': accountId,
      },
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [POST /user/avatar]:', error);
    throw error;
  }
}

/**
 * Change user name
 * @param {string} accountId - User account ID
 * @param {object} data - { newName }
 * @returns {Promise<object>} - Change name response
 */
export async function changeName(accountId, data) {
  try {
    const newName = data.newName;

    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({
        newName,
      }),
    };

    const url = `${API_BASE_URL}/api/user/change-name`;
    const response = await fetch(url, config);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [POST /user/change-name]:', error);
    throw error;
  }
}


/**
 * Change user password
 * @param {string} accountId - User account ID
 * @param {object} data - { currentPassword, newPassword, confirmNewPassword }
 * @returns {Promise<object>} - Change password response
 */
export async function changePassword(accountId, data) {
  try {
    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmNewPassword: data.confirmNewPassword,
      }),
    };

    const url = `${API_BASE_URL}/api/user/change-password`;
    const response = await fetch(url, config);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [POST /user/change-password]:', error);
    throw error;
  }
}

/**
 * Create a new chatbot
 * @param {string} accountId
 * @param {object} chatbotData - { name, purpose, greeting, fields, avatar_url }
 */
export async function createChatbot(accountId, chatbotData) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chatbots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify(chatbotData),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [POST /chatbots]:', error);
    throw error;
  }
}

/**
 * List chatbots for an account
 * @param {string} accountId
 */
export async function listChatbots(accountId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chatbots`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /chatbots]:', error);
    throw error;
  }
}

/**
 * List integrations (platform-specific) for an account
 * @param {string} accountId
 * @param {string} platform
 */
export async function listIntegrations(accountId, platform = null) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const url = new URL(`${API_BASE_URL}/api/integrations`);
    if (platform) url.searchParams.append('platform', platform);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('listIntegrations error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await parseResponse(response);
    return result;
  } catch (error) {
    console.error('API Error [GET /integrations]:', error);
    throw error;
  }
}

export async function listAllConversations(accountId) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const url = `${API_BASE_URL}/api/integrations/conversations/all`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('listAllConversations error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await parseResponse(response);
    return result;
  } catch (error) {
    console.error('API Error [GET /integrations/conversations/all]:', error);
    throw error;
  }
}

/**
 * Get messages for a conversation
 * @param {string} accountId
 * @param {string} convId
 * @param {object} opts - { limit, skip }
 */
export async function getConversationMessages(accountId, convId, opts = {}) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const url = new URL(`${API_BASE_URL}/api/facebook/conversations/${encodeURIComponent(convId)}/messages`);
    if (opts.limit) url.searchParams.append('limit', opts.limit);
    if (opts.skip) url.searchParams.append('skip', opts.skip);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /facebook/conversations/:id/messages]:', error);
    throw error;
  }
}

export async function markConversationRead(accountId, convId) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/facebook/conversations/${encodeURIComponent(convId)}/mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /facebook/conversations/:id/mark-read]:', error);
    throw error;
  }
}
/**
 * Send a message from a conversation (this will forward to Facebook)
 * @param {string} accountId
 * @param {string} convId
 * @param {string} text
 */
export async function sendConversationMessage(accountId, convId, text) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/facebook/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ text }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /facebook/conversations/:id/messages]:', error);
    throw error;
  }
}


/**
 * Send an attachment (image) in a conversation. imageData should be a data URL or an accessible URL.
 */
export async function sendConversationAttachment(accountId, convId, imageData, text = null) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/facebook/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ image: imageData, text }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /facebook/conversations/:id/messages (attachment)]:', error);
    throw error;
  }
}


export async function getZaloConversationMessages(accountId, convId, opts = {}) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const url = new URL(`${API_BASE_URL}/api/zalo/conversations/${encodeURIComponent(convId)}/messages`);
    if (opts.limit) url.searchParams.append('limit', opts.limit);
    if (opts.skip) url.searchParams.append('skip', opts.skip);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
        'ngrok-skip-browser-warning': '69420',
      },
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /zalo/conversations/:id/messages]:', error);
    throw error;
  }
}

export async function markZaloConversationRead(accountId, convId) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/zalo/conversations/${encodeURIComponent(convId)}/mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });
    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /zalo/conversations/:id/mark-read]:', error);
    throw error;
  }
}

export async function sendZaloConversationMessage(accountId, convId, text) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/zalo/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ text }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      const err = new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
      err.status = response.status;
      err.body = result;
      throw err;
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /zalo/conversations/:id/messages]:', error);
    throw error;
  }
}

export async function sendZaloConversationAttachment(accountId, convId, imageData, text = null) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/zalo/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ image: imageData, text }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      const err = new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
      err.status = response.status;
      err.body = result;
      throw err;
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /zalo/conversations/:id/messages (attachment)]:', error);
    throw error;
  }
}

/**
 * Get chatbot details by id
 * @param {string} accountId
 * @param {string} chatbotId
 */
export async function getChatbot(accountId, chatbotId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /chatbots/:id]:', error);
    throw error;
  }
}

/**
 * Update chatbot fields
 * @param {string} accountId
 * @param {string} chatbotId
 * @param {object} updates
 */
export async function updateChatbot(accountId, chatbotId, updates) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify(updates),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [PUT /chatbots/:id]:', error);
    throw error;
  }
}

/**
 * Upload chatbot avatar file (optionally update existing chatbot by chatbotId)
 * @param {string} accountId
 * @param {File} file
 * @param {string} chatbotId (optional)
 */
export async function uploadChatbotAvatar(accountId, file, chatbotId = null) {
  try {
    const formData = new FormData();
    formData.append('avatar', file);
    if (chatbotId) formData.append('chatbotId', chatbotId);

    const url = new URL(`${API_BASE_URL}/api/chatbots/avatar`);
    // attach chatbotId as query param if provided
    if (chatbotId) url.searchParams.append('chatbotId', chatbotId);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Account-Id': accountId,
      },
      body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [POST /chatbots/avatar]:', error);
    throw error;
  }
}

/**
 * Delete a chatbot by id
 * @param {string} accountId
 * @param {string} chatbotId
 */
export async function deleteChatbot(accountId, chatbotId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    console.error('API Error [DELETE /chatbots/:id]:', error);
    throw error;
  }
}

/* --------------------------- Training data helpers --------------------------- */

function getTrainingStorageKey(chatbotId) {
  return `trainingData_${chatbotId}`;
}

export async function listTrainingData(chatbotId, opts = {}) {
  try {
    // Try backend endpoint first
    try {
      const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
      const url = new URL(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}/training`);
      if (opts.limit) url.searchParams.append('limit', String(opts.limit));
      if (opts.skip) url.searchParams.append('skip', String(opts.skip));
      if (opts.q) url.searchParams.append('q', String(opts.q));
      if (opts.order) url.searchParams.append('order', String(opts.order));
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Account-Id': accountId },
      });
      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result.data || [], total: result.total };
      }
    } catch (e) {
      // fallback to localStorage
    }

    if (typeof window === 'undefined') {
      return { success: true, data: [] };
    }
    const key = getTrainingStorageKey(chatbotId);
    const raw = localStorage.getItem(key);
    const allData = raw ? JSON.parse(raw) : [];
    let data = allData.slice();
    // Apply ordering if requested (oldest/newest)
    if (opts.order) {
      data.sort((a, b) => {
        const ta = new Date(a.updated_at).getTime();
        const tb = new Date(b.updated_at).getTime();
        return opts.order === 'oldest' ? ta - tb : tb - ta;
      });
    }
    // Apply skip/limit
    const skip = opts.skip ? Number(opts.skip) : 0;
    const limit = opts.limit ? Number(opts.limit) : null;
    if (limit != null) {
      data = data.slice(skip, skip + limit);
    } else if (skip) {
      data = data.slice(skip);
    }
    return { success: true, data, total: allData.length };
  } catch (err) {
    console.error('listTrainingData error', err);
    return { success: false, data: [], message: err.message };
  }
}

export async function createTrainingData(chatbotId, trainingItem) {
  try {
    // Try backend endpoint first
    try {
      const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
      const response = await fetch(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}/training`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account-Id': accountId },
        body: JSON.stringify(trainingItem),
      });
      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result.data };
      }
    } catch (e) {
      // fallback to localStorage
    }

    if (typeof window === 'undefined') {
      return { success: false, message: 'No window context' };
    }
    const key = getTrainingStorageKey(chatbotId);
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    const newItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      status: trainingItem.status || 'active',
      question: trainingItem.question || '',
      answer: trainingItem.answer || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    data.unshift(newItem);
    localStorage.setItem(key, JSON.stringify(data));
    return { success: true, data: newItem };
  } catch (err) {
    console.error('createTrainingData error', err);
    return { success: false, message: err.message };
  }
}

export async function updateTrainingData(chatbotId, itemId, patch) {
  try {
    // Try server endpoint
    try {
      const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
      const response = await fetch(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}/training/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Account-Id': accountId },
        body: JSON.stringify(patch),
      });
      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result.data };
      }
    } catch (e) {
      // fallback to localStorage
    }

    const key = getTrainingStorageKey(chatbotId);
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    const idx = data.findIndex((d) => d.id === itemId);
    if (idx === -1) {
      return { success: false, message: 'Item not found' };
    }
    data[idx] = { ...data[idx], ...patch, updated_at: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(data));
    return { success: true, data: data[idx] };
  } catch (err) {
    console.error('updateTrainingData error', err);
    return { success: false, message: err.message };
  }
}

export async function deleteTrainingData(chatbotId, itemId) {
  try {
    // Try server
    try {
      const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
      const response = await fetch(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}/training/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Account-Id': accountId },
      });
      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result.data };
      }
    } catch (e) {
      // fallback local
    }

    const key = getTrainingStorageKey(chatbotId);
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    const newData = data.filter((d) => d.id !== itemId);
    localStorage.setItem(key, JSON.stringify(newData));
    return { success: true };
  } catch (err) {
    console.error('deleteTrainingData error', err);
    return { success: false, message: err.message };
  }
}

export async function deleteTrainingDataMultiple(chatbotId, itemIds = []) {
  try {
    // Optionally call server in future
    try {
      const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
      const response = await fetch(`${API_BASE_URL}/api/chatbots/${encodeURIComponent(chatbotId)}/training/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account-Id': accountId },
        body: JSON.stringify({ ids: itemIds }),
      });
      if (response.ok) {
        return { success: true };
      }
    } catch (e) {
      // fallback to local
    }

    const key = getTrainingStorageKey(chatbotId);
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    const newData = data.filter((d) => !itemIds.includes(d.id));
    localStorage.setItem(key, JSON.stringify(newData));
    return { success: true };
  } catch (err) {
    console.error('deleteTrainingDataMultiple error', err);
    return { success: false, message: err.message };
  }
}

export async function updateConversationNickname(accountId, oaId, customerId, nickname) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/integrations/conversations/nickname`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({
        oa_id: oaId,
        customer_id: customerId,
        nick_name: nickname,
      }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /integrations/conversations/nickname]:', error);
    throw error;
  }
}

// ==================== STAFF MANAGEMENT API FUNCTIONS ====================

export async function createStaff(staffData) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const response = await fetch(`${API_BASE_URL}/api/user/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({
        username: staffData.username,
        name: staffData.name,
        phoneNumber: staffData.phoneNumber,
        password: staffData.password,
        avatar: staffData.avatar || null,
        zaloUserId: staffData.zaloUserId
      }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /user/staff]:', error);
    throw error;
  }
}

export async function listStaffAccounts(skip = 0, limit = 50, search = null) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const params = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (search) {
      params.append('search', search);
    }

    const response = await fetch(`${API_BASE_URL}/api/user/staff?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-Account-Id': accountId,
      },
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /user/staff]:', error);
    throw error;
  }
}

export async function updateStaff(staffAccountId, updates) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const response = await fetch(`${API_BASE_URL}/api/user/staff/${encodeURIComponent(staffAccountId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify(updates),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [PUT /user/staff/:id]:', error);
    throw error;
  }
}

export async function deleteStaff(staffAccountId) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const response = await fetch(`${API_BASE_URL}/api/user/staff/${encodeURIComponent(staffAccountId)}`, {
      method: 'DELETE',
      headers: {
        'X-Account-Id': accountId,
      },
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [DELETE /user/staff/:id]:', error);
    throw error;
  }
}

export async function verifyAdminPassword(password) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const response = await fetch(`${API_BASE_URL}/api/user/verify-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ password }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /user/verify-password]:', error);
    throw error;
  }
}

export async function getStaffPassword(staffAccountId, verificationToken) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const response = await fetch(
      `${API_BASE_URL}/api/user/staff/${encodeURIComponent(staffAccountId)}/password?token=${encodeURIComponent(verificationToken)}`,
      {
        method: 'GET',
        headers: {
          'X-Account-Id': accountId,
        },
      }
    );

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /user/staff/:id/password]:', error);
    throw error;
  }
}

export async function toggleStaffActive(staffAccountId, isActive) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const response = await fetch(`${API_BASE_URL}/api/user/staff/${encodeURIComponent(staffAccountId)}/active`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ is_active: !!isActive }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /user/staff/:id/active]:', error);
    throw error;
  }
}

export async function searchStaff(query) {
  try {
    const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
    if (!accountId) throw new Error('No accountId available');

    const url = new URL(`${API_BASE_URL}/api/user/staff/search`);
    url.searchParams.append('q', query);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Account-Id': accountId,
      },
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /user/staff/search]:', error);
    throw error;
  }
}

export async function setConversationBotReply(platform, convId, enabled, accountId = null) {
  if (!platform || !convId) throw new Error('Platform and conversation id required');
  const endpoint = `/${platform}/conversations/${encodeURIComponent(convId)}/bot-reply`;
  // If accountId provided, include it in headers via apiCall wrapper by attaching to endpoint query
  // apiCall does not accept headers param, so include accountId in body? Better: append as query param so server picks it up.
  // Use query param only when accountId provided to satisfy server check (it accepts header or query)
  const ep = accountId ? `${endpoint}?accountId=${encodeURIComponent(accountId)}` : endpoint;
  return apiCall('POST', ep, { enabled });
}


/**
 * Widget: Get conversation messages
 * @param {string} accountId
 * @param {string} convId
 * @param {object} opts - { limit, skip }
 */
export async function getWidgetConversationMessages(accountId, convId, opts = {}) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const url = new URL(`${API_BASE_URL}/api/widget/conversations/${encodeURIComponent(convId)}/messages`);
    if (opts.limit) url.searchParams.append('limit', opts.limit);
    if (opts.skip) url.searchParams.append('skip', opts.skip);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [GET /widget/conversations/:id/messages]:', error);
    throw error;
  }
}

/**
 * Widget: Mark conversation as read
 * @param {string} accountId
 * @param {string} convId
 */
export async function markWidgetConversationRead(accountId, convId) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/widget/conversations/${encodeURIComponent(convId)}/mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });
    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /widget/conversations/:id/mark-read]:', error);
    throw error;
  }
}

/**
 * Widget: Send message
 * @param {string} accountId
 * @param {string} convId
 * @param {string} text
 */
export async function sendWidgetConversationMessage(accountId, convId, text) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/widget/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ text }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      const err = new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
      err.status = response.status;
      err.body = result;
      throw err;
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /widget/conversations/:id/messages]:', error);
    throw error;
  }
}

/**
 * Widget: Send attachment (image) in a conversation
 * @param {string} accountId
 * @param {string} convId
 * @param {string} imageData - Data URL or accessible URL
 * @param {string} text - Optional text
 */
export async function sendWidgetConversationAttachment(accountId, convId, imageData, text = null) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/widget/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ image: imageData, text }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      const err = new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
      err.status = response.status;
      err.body = result;
      throw err;
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /widget/conversations/:id/messages (attachment)]:', error);
    throw error;
  }
}


export async function saveInfoConversation(accountId, oaId, customerId, phoneNumber, note) {
  try {
    if (!accountId) throw new Error('No accountId available');
    const response = await fetch(`${API_BASE_URL}/api/integrations/customers/phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({
        oa_id: oaId,
        customer_id: customerId,
        phone: phoneNumber,
        note: note,
      }),
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Error [POST /integrations/customers/phone-number]:', error);
    throw error;
  }
}