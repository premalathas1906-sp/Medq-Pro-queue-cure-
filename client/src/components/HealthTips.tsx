import React, { useState, useEffect } from 'react';
import { Heart, Activity, Coffee, Compass, Moon } from 'lucide-react';

interface Tip {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const TIPS: Tip[] = [
  {
    title: "Stay Hydrated",
    description: "Drinking water helps maintain energy levels, improves brain function, and aids in digestion. Try to drink at least 8-10 glasses daily.",
    icon: <Coffee className="h-8 w-8 text-cyan-400" />,
    color: "from-cyan-500/20 to-blue-500/20"
  },
  {
    title: "Active Breaks",
    description: "Sitting for long periods can slow down metabolism. Stand up, stretch, or walk for 5 minutes for every hour of sitting.",
    icon: <Activity className="h-8 w-8 text-emerald-400" />,
    color: "from-emerald-500/20 to-teal-500/20"
  },
  {
    title: "Mindful Breathing",
    description: "Feeling anxious in the waiting room? Take 4 seconds to inhale, hold for 4 seconds, exhale for 4 seconds, and pause for 4. Repeat 5 times.",
    icon: <Heart className="h-8 w-8 text-rose-400" />,
    color: "from-rose-500/20 to-pink-500/20"
  },
  {
    title: "Healthy Screen Time",
    description: "Follow the 20-20-20 rule to rest your eyes: every 20 minutes, look at something 20 feet away for at least 20 seconds.",
    icon: <Compass className="h-8 w-8 text-amber-400" />,
    color: "from-amber-500/20 to-orange-500/20"
  },
  {
    title: "Quality Sleep",
    description: "Consistent sleep schedules strengthen your immune system and boost cognitive function. Aim for 7 to 9 hours of deep sleep tonight.",
    icon: <Moon className="h-8 w-8 text-indigo-400" />,
    color: "from-indigo-500/20 to-purple-500/20"
  }
];

export const HealthTips: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prevIndex) => (prevIndex + 1) % TIPS.length);
    }, 6000); // Transitions every 6 seconds
    return () => clearInterval(timer);
  }, []);

  const activeTip = TIPS[activeIndex];

  return (
    <div className={`relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br ${activeTip.color} border border-white/10 transition-all duration-700 ease-in-out`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 shadow-inner">
          {activeTip.icon}
        </div>
        <div className="flex-1">
          <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">Health tip of the minute</span>
          <h4 className="text-lg font-bold text-white mt-0.5">{activeTip.title}</h4>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed h-[60px] overflow-hidden">
            {activeTip.description}
          </p>
        </div>
      </div>

      {/* Progress Dots */}
      <div className="flex justify-center gap-1.5 mt-4">
        {TIPS.map((_, index) => (
          <button
            key={index}
            onClick={() => setActiveIndex(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/20 hover:bg-white/40'
            }`}
            aria-label={`Go to tip ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
