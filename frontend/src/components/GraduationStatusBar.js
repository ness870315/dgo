import React from 'react';
import { TrendingUp, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

const GraduationStatusBar = ({ 
  bondingProgress = 0, 
  proximityLevel = 'FAR_FROM_GRADUATION',
  showLabel = true,
  compact = false 
}) => {
  // Calculate progress percentage (0-100)
  const progress = Math.min(Math.max(bondingProgress, 0), 100);
  
  // Get proximity level styling
  const getProximityConfig = (level) => {
    switch (level) {
      case 'IMMINENT_GRADUATION':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-400',
          icon: AlertTriangle,
          label: 'IMMINENT',
          description: 'Graduation imminent'
        };
      case 'VERY_CLOSE_TO_GRADUATION':
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-400',
          icon: AlertTriangle,
          label: 'VERY CLOSE',
          description: 'Very close to graduation'
        };
      case 'CLOSE_TO_GRADUATION':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-400',
          icon: Clock,
          label: 'CLOSE',
          description: 'Close to graduation'
        };
      case 'APPROACHING_GRADUATION':
        return {
          color: 'bg-blue-500',
          textColor: 'text-blue-400',
          icon: TrendingUp,
          label: 'APPROACHING',
          description: 'Approaching graduation'
        };
      case 'FAR_FROM_GRADUATION':
      default:
        return {
          color: 'bg-gray-500',
          textColor: 'text-gray-400',
          icon: CheckCircle,
          label: 'FAR',
          description: 'Far from graduation'
        };
    }
  };

  const config = getProximityConfig(proximityLevel);
  const IconComponent = config.icon;

  // Determine if we should show green check (100% progress)
  const isComplete = progress >= 100;
  const displayIcon = isComplete ? CheckCircle : IconComponent;
  const displayColor = isComplete ? 'bg-green-500' : config.color;
  const displayTextColor = isComplete ? 'text-green-400' : config.textColor;

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${displayColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center space-x-1">
          {React.createElement(displayIcon, { size: 12, className: displayTextColor })}
          <span className={`text-xs font-medium ${displayTextColor}`}>
            {progress.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          {showLabel && (
            <div className="flex items-center space-x-2">
              {React.createElement(displayIcon, { size: 16, className: displayTextColor })}
              <span className={`text-sm font-medium ${displayTextColor}`}>
                {isComplete ? 'COMPLETE' : config.label}
              </span>
            </div>
          )}
          <span className="text-sm font-bold text-white">
            {progress.toFixed(1)}%
          </span>
        </div>
        
        <div className="bg-gray-700 rounded-full h-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${displayColor} relative`}
            style={{ width: `${progress}%` }}
          >
            {/* Gradient effect for better visual appeal */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20" />
          </div>
        </div>
      </div>

      {/* Status Description */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{config.description}</span>
        <span>Bonding Curve Progress</span>
      </div>

      {/* Proximity Indicators */}
      <div className="flex items-center space-x-4 text-xs">
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-gray-500 rounded-full" />
          <span className="text-gray-400">0%</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
          <span className="text-gray-400">90%</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-yellow-500 rounded-full" />
          <span className="text-gray-400">95%</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-orange-500 rounded-full" />
          <span className="text-gray-400">97%</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-gray-400">99%</span>
        </div>
      </div>
    </div>
  );
};

export default GraduationStatusBar;
