import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Sparkles, MessageCircle, Star, BarChart3, TrendingUp, Save, History, Trash2, FolderOpen, Move, ArrowLeft } from 'lucide-react';
import aiChatService from '../services/aiChatService';
import { useAuth } from '../contexts/AuthContext';
import './AIChatModal.css';

const AIChatModal = ({ isOpen, onClose, initialPosition = null }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showHistories, setShowHistories] = useState(false);
  const [chatHistories, setChatHistories] = useState([]);
  const [personalizedSuggestions, setPersonalizedSuggestions] = useState([]);
  const [showWelcome, setShowWelcome] = useState(true);
  
  // Positioning state
  const [position, setPosition] = useState(() => {
    if (initialPosition) return initialPosition;
    return {
      x: Math.max(0, (window.innerWidth - 450) / 2), // Default to center horizontally
      y: Math.max(0, (window.innerHeight - 600) / 2) // Default to center vertically
    };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  const suggestedQuestions = aiChatService.getSuggestedQuestions();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Load conversation history when modal opens
  useEffect(() => {
    if (isOpen) {
      const history = aiChatService.getHistory();
      const formattedHistory = history.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        hasUserData: false // History doesn't track this
      }));
      setMessages(formattedHistory);
      setShowSuggestions(formattedHistory.length === 0);
      
      // Load personalized suggestions and chat histories
      loadPersonalizedData();
    }
  }, [isOpen]);

  // Load chat histories only (personalized suggestions disabled)
  const loadPersonalizedData = async () => {
    try {
      const histories = await aiChatService.getChatHistories();
      
      // Disable personalized suggestions - always use default ones
      setPersonalizedSuggestions([]);
      setChatHistories(histories);
    } catch (error) {
      console.error('Error loading chat histories:', error);
    }
  };

  // Drag functionality for modal positioning
  const handleHeaderMouseDown = (e) => {
    // Only allow dragging from the header area
    if (e.target.closest('.chat-header-controls')) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    // Constrain to viewport bounds
    const modalWidth = Math.min(450, window.innerWidth - 32);
    const modalHeight = Math.min(600, window.innerHeight - 32);
    const maxX = window.innerWidth - modalWidth;
    const maxY = window.innerHeight - modalHeight;

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global event listeners for drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isDragging, dragStart]);

  // Handle window resize to keep modal in bounds
  useEffect(() => {
    const handleResize = () => {
      const modalWidth = Math.min(450, window.innerWidth - 32);
      const modalHeight = Math.min(600, window.innerHeight - 32);
      const maxX = window.innerWidth - modalWidth;
      const maxY = window.innerHeight - modalHeight;
      
      setPosition(prev => ({
        x: Math.min(prev.x, maxX),
        y: Math.min(prev.y, maxY)
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSendMessage = async (messageText = null) => {
    const message = messageText || inputMessage.trim();
    if (!message || isLoading) return;

    setInputMessage('');
    setShowSuggestions(false);
    setShowWelcome(false); // Hide welcome screen when user starts chatting
    setIsLoading(true);

    // Add user message to UI
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Send to AI
      const response = await aiChatService.sendMessage(message);

      // Add AI response to UI
      const aiMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: response.timestamp || new Date().toISOString(),
        hasUserData: response.hasUserData,
        dataUsed: response.dataUsed,
        actionSuggestions: response.actionSuggestions || [],
        commandsExecuted: response.commandsExecuted || [],
        success: response.success
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage = {
        role: 'assistant',
        content: "Sorry, I'm having trouble right now. Please try again! 🤖",
        timestamp: new Date().toISOString(),
        hasUserData: false,
        success: false
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    handleSendMessage(suggestion);
  };

  const handleBackToWelcome = () => {
    setShowWelcome(true);
    setShowSuggestions(true);
    setShowHistories(false);
  };

  const handleActionClick = async (action) => {
    setIsLoading(true);
    
    try {
      console.log(`🎯 Executing action: ${action.type}`);
      const result = await aiChatService.executeAction(action);
      
      // Add result message to chat
      const resultMessage = {
        role: 'assistant',
        content: result.success ? 
          `✅ ${result.message}` : 
          `❌ ${result.error}`,
        timestamp: new Date().toISOString(),
        hasUserData: false,
        success: result.success,
        isActionResult: true
      };
      
      setMessages(prev => [...prev, resultMessage]);
      
    } catch (error) {
      console.error('Error executing action:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: `❌ Failed to execute action: ${error.message}`,
        timestamp: new Date().toISOString(),
        hasUserData: false,
        success: false,
        isActionResult: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    aiChatService.clearHistory();
    setShowSuggestions(true);
  };

  const handleSaveChat = async () => {
    if (messages.length === 0) {
      alert('No conversation to save!');
      return;
    }

    const title = prompt('Enter a title for this chat:', `Chat ${new Date().toLocaleDateString()}`);
    if (!title) return;

    setIsLoading(true);
    try {
      await aiChatService.saveChatHistory(title);
      
      // Refresh chat histories
      const histories = await aiChatService.getChatHistories();
      setChatHistories(histories);
      
      alert('✅ Chat saved successfully!');
    } catch (error) {
      console.error('Error saving chat:', error);
      alert('❌ Failed to save chat: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadChat = async (historyId) => {
    setIsLoading(true);
    try {
      const history = await aiChatService.loadChatHistory(historyId);
      
      // Convert history messages to display format
      const formattedHistory = history.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        hasUserData: false
      }));
      
      setMessages(formattedHistory);
      setShowSuggestions(false);
      setShowHistories(false);
      
      console.log(`📖 Loaded: ${history.title}`);
    } catch (error) {
      console.error('Error loading chat:', error);
      alert('❌ Failed to load chat: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChat = async (historyId, event) => {
    event.stopPropagation(); // Prevent triggering load
    
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm('Are you sure you want to delete this chat history?')) {
      return;
    }

    try {
      const remainingHistories = await aiChatService.deleteChatHistory(historyId);
      setChatHistories(remainingHistories);
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert('❌ Failed to delete chat: ' + error.message);
    }
  };

  // Debug logging (only log once when modal opens)
  useEffect(() => {
    if (isOpen) {
      const modalWidth = Math.min(450, window.innerWidth - 32);
      const modalHeight = Math.min(600, window.innerHeight - 32);
      
      console.log('🔍 [AI CHAT MODAL DEBUG] Modal opened:', {
        messages: messages.length,
        showSuggestions,
        showHistories,
        chatHistories: chatHistories.length,
        personalizedSuggestions: personalizedSuggestions.length,
        suggestedQuestions: suggestedQuestions.length,
        position,
        windowSize: { width: window.innerWidth, height: window.innerHeight },
        modalSize: { width: modalWidth, height: modalHeight },
        shouldShowWelcome: messages.length === 0 && !showHistories,
        shouldShowSuggestions: showSuggestions && !showHistories
      });
    }
  }, [isOpen]); // Simplified dependencies to prevent excessive re-renders

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 p-4">
      <div 
        ref={modalRef}
        className={`ai-chat-modal ${isDragging ? 'dragging' : ''}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: Math.min(450, window.innerWidth - 32),
          height: Math.min(600, window.innerHeight - 32)
        }}
      >
        <div className="bg-gray-900 rounded-2xl border border-white/10 w-full h-full relative overflow-hidden">
          
          {/* Header with drag handle */}
          <div 
            className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 border-b border-white/10 chat-header"
            onMouseDown={handleHeaderMouseDown}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', height: '60px' }}
          >
            <div className="flex items-center gap-2">
              <Move size={16} className="text-gray-400" />
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-white">Degen Oracle AI</span>
              </div>
              {!showWelcome && (
                <button
                  onClick={handleBackToWelcome}
                  className="ml-2 px-1.5 py-0.5 text-xs bg-gray-600 hover:bg-gray-700 rounded text-white transition-colors flex items-center gap-1"
                  title="Back to Welcome"
                >
                  <ArrowLeft size={8} />
                  Back
                </button>
              )}
            </div>
            
            <div className="chat-header-controls flex items-center gap-1">
            <button
              onClick={handleSaveChat}
              disabled={messages.length === 0 || isLoading}
              className="px-1.5 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded text-white transition-colors flex items-center gap-1"
            >
              <Save size={8} />
              Save Chat
            </button>
            <button
              onClick={() => setShowHistories(!showHistories)}
              className="px-1.5 py-0.5 text-xs bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors flex items-center gap-1"
            >
              <History size={8} />
              History ({chatHistories.length})
            </button>
            <button
              onClick={clearChat}
              className="px-1.5 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white transition-colors"
            >
              Clear Chat
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>
            </div>
          </div>

        {/* Messages */}
        <div className="absolute top-16 left-0 right-0 bottom-16 overflow-y-auto p-4 space-y-4">
          
          {/* Chat Histories Panel */}
          {showHistories && (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FolderOpen size={16} />
                  Saved Chats (Max 3)
                </h4>
                <button
                  onClick={() => setShowHistories(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              
              {chatHistories.length === 0 ? (
                <p className="text-gray-400 text-sm">No saved chats yet. Start a conversation and save it!</p>
              ) : (
                <div className="space-y-2">
                  {chatHistories.map((history) => (
                    <div
                      key={history.id}
                      onClick={() => handleLoadChat(history.id)}
                      className="flex items-center justify-between p-3 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">{history.title}</div>
                        <div className="text-xs text-gray-400">
                          {history.messageCount} messages • {new Date(history.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteChat(history.id, e)}
                        className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Welcome Message */}
          {showWelcome && !showHistories && (
            <div className="text-center py-8" key="welcome-message">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Welcome to Degen Oracle AI!</h3>
              <p className="text-gray-400 mb-6">
                I have access to the Solana Blockchain, your KOL calls, watchlist, hype data, and more. I learn from our conversations to provide personalized insights!
              </p>
            </div>
          )}

          {/* Suggested Questions */}
          {showWelcome && showSuggestions && !showHistories && (
            <div className="space-y-2" key="suggestions-container">
              <p className="text-sm text-gray-400 font-medium">
                {personalizedSuggestions.length > 0 ? '🧠 Personalized suggestions:' : 'Try asking me:'}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {(personalizedSuggestions.length > 0 ? personalizedSuggestions : suggestedQuestions).slice(0, 6).map((question, index) => (
                  <button
                    key={`suggestion-${index}-${question.substring(0, 20)}`}
                    onClick={() => handleSuggestionClick(question)}
                    className="text-left p-3 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-colors"
                  >
                    <span className="text-sm text-gray-300">{question}</span>
                    {personalizedSuggestions.length > 0 && (
                      <span className="ml-2 text-xs text-purple-400">✨</span>
                    )}
                  </button>
                ))}
              </div>
              
              {personalizedSuggestions.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  💡 These suggestions are based on your conversation history and interests
                </p>
              )}
            </div>
          )}

          {/* Chat Messages */}
          {messages.map((message, index) => (
            <div key={index} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              
              {message.role === 'assistant' && (
                <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
              )}

              <div className={`max-w-[80%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                <div className={`p-3 rounded-2xl ${
                  message.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : message.success === false 
                      ? 'bg-red-900/30 border border-red-600/30 text-red-200'
                      : 'bg-gray-800 text-gray-100'
                }`}>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed message-content">
                    {message.content}
                  </div>
                  
                  {/* Data sources indicator */}
                  {message.role === 'assistant' && message.hasUserData && message.dataUsed && (
                    <div className="mt-2 pt-2 border-t border-gray-600/30">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <MessageCircle size={12} />
                        <span>Used: {message.dataUsed.join(', ')}</span>
                      </div>
                    </div>
                  )}

                  {/* Action suggestions */}
                  {message.role === 'assistant' && message.actionSuggestions && message.actionSuggestions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-600/30">
                      <div className="text-xs text-gray-400 mb-2">Quick Actions:</div>
                      <div className="flex flex-wrap gap-2">
                        {message.actionSuggestions.map((action, actionIndex) => (
                          <button
                            key={actionIndex}
                            onClick={() => handleActionClick(action)}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-md text-blue-300 transition-colors disabled:opacity-50"
                          >
                            {action.type === 'ADD_TO_WATCHLIST' && <Star size={12} />}
                            {action.type === 'GET_FULL_ANALYSIS' && <BarChart3 size={12} />}
                            {action.type === 'VIEW_CHART' && <TrendingUp size={12} />}
                            <span>{action.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-gray-500 mt-1 px-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {message.role === 'user' && (
                <div className="flex flex-col items-center">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                    title={user?.displayName || user?.username || 'User'}
                  >
                    {user?.profileImage ? (
                      <img 
                        src={user.profileImage} 
                        alt={user.displayName || user.username || 'User'} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-full h-full bg-gray-600 rounded-full flex items-center justify-center ${user?.profileImage ? 'hidden' : 'flex'}`}
                    >
                      <User size={16} className="text-white" />
                    </div>
                  </div>
                  {user?.displayName && (
                    <div className="text-xs text-gray-400 mt-1 text-center max-w-16 truncate">
                      {user.displayName.split(' ')[0]}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-gray-800 p-3 rounded-2xl">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about your calls, watchlist, or anything crypto..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded-lg text-white transition-colors flex items-center gap-2"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default AIChatModal;
