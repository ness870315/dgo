/**
 * Centralized status determination utility
 * This is the single source of truth for token status tags
 */

/**
 * Get status tag based on overall score
 * @param {number} score - The overall score (0-10)
 * @returns {Object} Status object with level, color, icon, and emoji
 */
export const getStatusFromScore = (score) => {
  const numScore = parseFloat(score) || 0;
  
  if (numScore >= 9.0) {
    return {
      level: 'VIRAL',
      color: '#a855f7', // purple
      icon: '🚀',
      emoji: '🚀',
      textColor: 'text-purple-400',
      bgColor: 'bg-purple-900/30'
    };
  } else if (numScore >= 8.0) {
    return {
      level: 'TRENDING',
      color: '#22c55e', // green
      icon: '🔥',
      emoji: '🔥',
      textColor: 'text-green-400',
      bgColor: 'bg-green-900/30'
    };
  } else if (numScore >= 7.0) {
    return {
      level: 'BUILDING',
      color: '#f97316', // orange
      icon: '📈',
      emoji: '📈',
      textColor: 'text-orange-400',
      bgColor: 'bg-orange-900/30'
    };
  } else if (numScore >= 5.0) {
    return {
      level: 'WAKING UP',
      color: '#3b82f6', // blue
      icon: '⚡',
      emoji: '⚡',
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-900/30'
    };
  } else {
    return {
      level: 'SLEEPING',
      color: '#6b7280', // gray
      icon: '😴',
      emoji: '😴',
      textColor: 'text-gray-400',
      bgColor: 'bg-gray-900/30'
    };
  }
};

/**
 * Get status tag for a token object
 * @param {Object} token - Token object with score/overallScore
 * @returns {Object} Status object
 */
export const getTokenStatus = (token) => {
  const score = token?.overallScore || token?.score || token?.enhancedScore?.overallScore || 0;
  return getStatusFromScore(score);
};

/**
 * Get status label for display
 * @param {number} score - The overall score (0-10)
 * @returns {string} Status label
 */
export const getStatusLabel = (score) => {
  return getStatusFromScore(score).level;
};

/**
 * Get status color for display
 * @param {number} score - The overall score (0-10)
 * @returns {string} Status color
 */
export const getStatusColor = (score) => {
  return getStatusFromScore(score).color;
};

/**
 * Get status icon for display
 * @param {number} score - The overall score (0-10)
 * @returns {string} Status icon
 */
export const getStatusIcon = (score) => {
  return getStatusFromScore(score).icon;
};
