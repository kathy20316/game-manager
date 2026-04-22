import React, { useState } from 'react';
import { Calendar, Clock, Users, Award, Plus, X } from 'lucide-react';

const GameCard = ({ date, time, level, classification, referees }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4 shadow-sm hover:shadow-md transition-shadow">
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
      <div className="flex items-center space-x-3">
        <Calendar className="text-gray-400 w-5 h-5" />
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Date</p>
          <p className="text-gray-900 font-semibold">{date}</p>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        <Clock className="text-gray-400 w-5 h-5" />
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Time</p>
          <p className="text-gray-900 font-semibold">{time}</p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <Users className="text-gray-400 w-5 h-5" />
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Level</p>
          <p className="text-gray-900 font-semibold">{level}</p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <Award className="text-gray-400 w-5 h-5" />
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Classification</p>
          <p className="text-gray-900 font-semibold">{classification}</p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <span className="text-gray-400 font-bold text-lg w-5 text-center">{referees.split(' ')[0]}</span>
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Referees</p>
          <p className="text-gray-900 font-semibold">{referees}</p>
        </div>
      </div>
    </div>
  </div>
);

const GameDashboard = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const initialGames = [
    { date: "Sun, Apr 12, 2026", time: "2:00 PM", level: "U14", classification: "Grade 7", referees: "3 referees" },
    { date: "Sun, Apr 12, 2026", time: "4:30 PM", level: "U18", classification: "Grade 6", referees: "3 referees" },
    { date: "Wed, Apr 15, 2026", time: "7:00 PM", level: "Adult Competitive", classification: "Regional", referees: "4 referees" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      {/* Header */}
      <div className="max-w-6xl mx-auto flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-blue-700">Game Manager</h1>
          <p className="text-gray-500 mt-1">Schedule and assign referees to games</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Create Game
        </button>
      </div>

      {/* Game List */}
      <div className="max-w-6xl mx-auto">
        {initialGames.map((game, idx) => (
          <GameCard key={idx} {...game} />
        ))}
      </div>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Create Game</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
                <div className="relative">
                  <input type="date" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time</label>
                <input type="time" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black outline-none" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Level / Age Group</label>
                <select className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black outline-none appearance-none">
                  <option>Select level</option>
                  <option>U14</option>
                  <option>U18</option>
                  <option>Adult Competitive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Number of Referees</label>
                <input type="number" defaultValue="1" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black outline-none" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Referee Classification</label>
                <select className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black outline-none appearance-none">
                  <option>Select classification</option>
                  <option>Grade 7</option>
                  <option>Grade 6</option>
                  <option>Regional</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 font-semibold text-white bg-black hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Create Game
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameDashboard;
