import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, query, orderBy, addDoc, updateDoc
} from 'firebase/firestore';
import { LogOut, User, Clock, Calendar, AlertTriangle, CheckCircle, Plus, X, List, Menu, Home, BookOpen, ChevronRight, BarChart3 } from 'lucide-react';

// --- CONFIGURATION & CONSTANTS ---
const APP_NAME = "Time Manipulation";
const APP_ICON = (
  <div className="relative inline-flex items-center justify-center text-4xl">
    <Clock className="w-8 h-8 text-indigo-500 transform rotate-12" />
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
      <div className="w-6 h-6 rounded-full bg-indigo-600/20 shadow-inner"></div>
    </div>
    <div className="absolute right-0 bottom-0 text-xl text-gray-800">
      <span role="img" aria-label="Palm" className="transform scale-x-[-1]">🖐️</span>
    </div>
  </div>
);

const MOTIVATIONAL_PHRASES = [
  "Time is gold, don't waste it!",
  "Keep it up, you can do it!",
  "Amazing work done!",
  "Cheer up! Clean it up!",
  "Master of your time, keep winning!",
  "Every minute counts, great job!",
  "The next goal awaits, let's go!",
  "Focus on the present, excel at the next!",
  "You're in control. Finish strong!",
  "You are crushing it, keep the momentum!",
];

// Firestore access variables provided by the environment
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Helper function to format HH:mm string to Date object for today
const timeStringToDate = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  return date;
};

// Component for the simulated notification/reminder
const ReminderNotification = ({ currentTask, nextTask, onDismiss }) => {
  if (!currentTask) return null;

  const phrase = MOTIVATIONAL_PHRASES[Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length)];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border-t-4 border-indigo-600 animate-slideDown">
        <div className="flex items-center mb-4">
          <Clock className="w-6 h-6 text-indigo-600 mr-3" />
          <h3 className="text-xl font-bold text-gray-800">Time Alert!</h3>
        </div>
        <p className="text-sm text-gray-600 italic mb-3">"{phrase}"</p>
        <p className="text-gray-700 font-semibold mb-1">
          Activity "{currentTask.activity}" is scheduled to end now.
        </p>
        {nextTask ? (
          <p className="text-sm text-gray-500">
            Next up: <span className="font-medium text-indigo-600">{nextTask.activity}</span> at {nextTask.startTime}.
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            You've completed your schedule for the day!
          </p>
        )}
        <button
          onClick={onDismiss}
          className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition duration-150"
        >
          Acknowledge & Finish
        </button>
      </div>
    </div>
  );
};

// Component for Initial Permission Request
const PermissionRequest = ({ onComplete }) => {
  const [status, setStatus] = useState('pending');

  const requestPermissions = async () => {
    // 1. Simulate Notification Permission
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setStatus('granted');
      } else {
        setStatus('denied');
      }
    } catch (error) {
      console.error("Notification permission error:", error);
      setStatus('denied');
    }
  };

  return (
    <div className="p-8 h-full flex flex-col items-center justify-center text-center bg-gray-50">
      <BookOpen className="w-12 h-12 text-indigo-600 mb-4" />
      <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Welcome to Time Manipulation!</h2>
      <p className="text-gray-600 mb-6">
        This app requires two permissions to function optimally for scheduling and reminders.
      </p>

      <div className="w-full max-w-sm space-y-4">
        <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-indigo-500 flex items-center">
          <AlertTriangle className="w-5 h-5 text-indigo-500 mr-3" />
          <div className="text-left">
            <p className="font-semibold text-gray-800">Notifications</p>
            <p className="text-sm text-gray-500">Required for on-time task reminders.</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-indigo-500 flex items-center">
          <Calendar className="w-5 h-5 text-indigo-500 mr-3" />
          <div className="text-left">
            <p className="font-semibold text-gray-800">Calendar Access (Simulated)</p>
            <p className="text-sm text-gray-500">To help track and adjust schedules.</p>
          </div>
        </div>
      </div>

      {status === 'pending' && (
        <button
          onClick={requestPermissions}
          className="mt-8 w-full max-w-sm bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition duration-150 shadow-lg"
        >
          Request Permissions
        </button>
      )}

      {status !== 'pending' && (
        <div className="mt-6 text-green-600 font-semibold">
          <p>Permissions {status === 'granted' ? 'granted!' : 'requested.'} </p>
          <button
            onClick={() => onComplete(status === 'granted')}
            className="mt-4 text-sm text-indigo-500 hover:text-indigo-700 underline"
          >
            Continue to Profile Setup
          </button>
        </div>
      )}
    </div>
  );
};

// Component for User Profile Setup
const ProfileSetup = ({ onComplete, initialNotificationStatus }) => {
  const [form, setForm] = useState({ name: '', birthday: '', nickname: '' });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.birthday || !form.nickname) {
      setError('Please fill out all fields.');
      return;
    }
    onComplete(form, initialNotificationStatus);
  };

  return (
    <div className="p-8 h-full flex flex-col items-center justify-center bg-gray-50">
      <User className="w-10 h-10 text-indigo-600 mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Setup Your Identity</h2>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 bg-white p-6 rounded-xl shadow-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700">Real Name</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2"
            placeholder="Your full name"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Birthday</label>
          <input
            type="date"
            name="birthday"
            value={form.birthday}
            onChange={handleChange}
            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Desired Nickname</label>
          <input
            type="text"
            name="nickname"
            value={form.nickname}
            onChange={handleChange}
            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2"
            placeholder="Your awesome handle"
            required
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition duration-150 shadow-md"
        >
          Start Manipulating Time
        </button>
      </form>
    </div>
  );
};

// Component for adding a new schedule item
const AddScheduleForm = ({ userId, db, schedules, setSchedules }) => {
  const [activity, setActivity] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!activity || !startTime || !endTime) {
      setError('Please fill in all fields.');
      return;
    }

    const start = timeStringToDate(startTime);
    const end = timeStringToDate(endTime);

    if (end <= start) {
      setError('End time must be after start time.');
      return;
    }

    const newSchedule = {
      id: Date.now().toString(), // Client-side ID for list key
      activity,
      startTime,
      endTime,
      status: 'pending', // 'pending' | 'active' | 'completed' | 'overtimed'
    };

    const newTasks = [...schedules.tasks, newSchedule].sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    try {
      const scheduleDocRef = doc(db, `artifacts/${appId}/users/${userId}/data/schedules`, 'today');
      await setDoc(scheduleDocRef, { tasks: newTasks });

      setActivity('');
      setStartTime('');
      setEndTime('');
      setIsAdding(false);
    } catch (e) {
      console.error("Error adding document: ", e);
      setError('Failed to save schedule. Try again.');
    }
  };
  
  const handleRemove = async (taskId) => {
      const newTasks = schedules.tasks.filter(t => t.id !== taskId);
      try {
        const scheduleDocRef = doc(db, `artifacts/${appId}/users/${userId}/data/schedules`, 'today');
        await setDoc(scheduleDocRef, { tasks: newTasks });
      } catch (e) {
        console.error("Error removing task:", e);
      }
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-lg mb-6">
      <button
        onClick={() => setIsAdding(!isAdding)}
        className="w-full flex items-center justify-center p-3 text-lg font-bold text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition duration-150"
      >
        {isAdding ? <X className="w-5 h-5 mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
        {isAdding ? 'Close Schedule Form' : 'Add New Task'}
      </button>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t pt-4">
          <input
            type="text"
            placeholder="Activity Name (e.g., Deep Work)"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
          <div className="flex space-x-2">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button
            type="submit"
            className="w-full bg-indigo-500 text-white py-2 rounded-lg font-semibold hover:bg-indigo-600 transition duration-150"
          >
            Schedule It
          </button>
        </form>
      )}
      
      {/* Displaying schedules */}
      <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
        {schedules.tasks.map((task, index) => (
          <div key={task.id} className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
            <span className="font-medium text-gray-800 flex-1 truncate">{task.activity}</span>
            <span className="text-sm text-indigo-600 mx-3">{task.startTime} - {task.endTime}</span>
            <button onClick={() => handleRemove(task.id)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-4 h-4"/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};


// Component for Main Scheduler View
const MainScheduler = ({ profile, schedules, userId, db, onShowHistory }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notificationState, setNotificationState] = useState({ 
    isActive: false, 
    currentTask: null, 
    nextTask: null 
  });
  
  // Find the currently active task
  const activeTasks = useMemo(() => schedules.tasks.filter(t => t.status !== 'completed' && t.status !== 'overtimed'), [schedules.tasks]);
  const currentTask = activeTasks.find(task => {
    const start = timeStringToDate(task.startTime);
    const end = timeStringToDate(task.endTime);
    // Task is active if current time is >= start and < end, OR if it's past end time but not marked finished
    return currentTime >= start && currentTime < new Date(end.getTime() + 20 * 60000) && task.status !== 'completed' && task.status !== 'overtimed';
  });
  const currentTaskIndex = currentTask ? schedules.tasks.findIndex(t => t.id === currentTask.id) : -1;
  const nextTask = currentTaskIndex !== -1 && currentTaskIndex < schedules.tasks.length - 1 
    ? schedules.tasks[currentTaskIndex + 1] : null;

  // --- Real-Time Clock & Check Interval ---
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Core Task Timing Logic (Reminder, Overtime Check, Auto-Advance) ---
  useEffect(() => {
    if (!currentTask || notificationState.isActive) return;

    const scheduledEnd = timeStringToDate(currentTask.endTime);
    const overtimeTrigger = new Date(scheduledEnd.getTime() + 15 * 60000); // End + 15 min
    const autoAdvanceTrigger = new Date(scheduledEnd.getTime() + 20 * 60000); // End + 20 min

    // 1. Reminder Notification Trigger (at scheduled end time)
    if (currentTime >= scheduledEnd && currentTime < overtimeTrigger) {
      if (!notificationState.isActive) {
        // Trigger UI notification and browser notification (if permission granted)
        setNotificationState({ isActive: true, currentTask, nextTask });
        if (profile.notificationPermission === 'granted') {
          new Notification(APP_NAME, {
            body: `Reminder: ${currentTask.activity} is scheduled to end. Next: ${nextTask?.activity || 'N/A'}`,
            icon: 'https://placehold.co/48x48/6366f1/ffffff?text=TM'
          });
        }
      }
    }

    // 2. Overtime & Auto-Advance Trigger (End + 20 min)
    if (currentTime >= autoAdvanceTrigger) {
      handleOvertimeAdvance(scheduledEnd);
    }
  }, [currentTime, currentTask, nextTask, notificationState.isActive, profile.notificationPermission]);

  // Function to update task status in Firestore
  const updateTaskStatus = useCallback(async (taskId, newStatus) => {
    const updatedTasks = schedules.tasks.map(t => 
      t.id === taskId ? { ...t, status: newStatus } : t
    );
    try {
      const scheduleDocRef = doc(db, `artifacts/${appId}/users/${userId}/data/schedules`, 'today');
      await setDoc(scheduleDocRef, { tasks: updatedTasks });
    } catch (e) {
      console.error("Error updating task status:", e);
    }
  }, [schedules.tasks, userId, db]);
  
  // Function to log activity to history (on-time or overtime)
  const logActivityToHistory = useCallback(async (task, actualEndTime, status) => {
    try {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/history/activities`), {
        activity: task.activity,
        scheduledStart: task.startTime,
        scheduledEnd: task.endTime,
        actualEnd: actualEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        status: status, // 'on-time' or 'overtimed'
        date: new Date().toISOString().split('T')[0],
        userId: userId,
      });
    } catch (e) {
      console.error("Error logging history:", e);
    }
  }, [userId, db]);

  // Handler for finishing a task (On-Time / Overtime Logic)
  const handleFinished = useCallback(async () => {
    setNotificationState({ isActive: false, currentTask: null, nextTask: null });
    if (!currentTask) return;

    const scheduledEnd = timeStringToDate(currentTask.endTime);
    const actualEnd = new Date();
    const overtimeTrigger = new Date(scheduledEnd.getTime() + 15 * 60000); // End + 15 min

    const status = actualEnd > overtimeTrigger ? 'overtimed' : 'on-time';
    
    // Log history
    await logActivityToHistory(currentTask, actualEnd, status);
    
    // Update active task to 'completed'
    await updateTaskStatus(currentTask.id, 'completed');

  }, [currentTask, logActivityToHistory, updateTaskStatus]);

  // Handler for auto-advancing due to excessive overtime
  const handleOvertimeAdvance = useCallback(async (scheduledEnd) => {
    setNotificationState({ isActive: false, currentTask: null, nextTask: null });
    if (!currentTask) return;

    const autoAdvanceTime = new Date(scheduledEnd.getTime() + 20 * 60000);

    // Log history as overtime with the auto-advance time
    await logActivityToHistory(currentTask, autoAdvanceTime, 'overtimed');
    
    // Update active task to 'overtimed'
    await updateTaskStatus(currentTask.id, 'overtimed');
  }, [currentTask, logActivityToHistory, updateTaskStatus]);

  const timeDisplay = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateDisplay = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  
  const finishButtonStatus = useMemo(() => {
    if (!currentTask) return { text: 'No Active Task', style: 'bg-gray-400 cursor-not-allowed' };
    
    const scheduledEnd = timeStringToDate(currentTask.endTime);
    const now = new Date();
    const overtimeTrigger = new Date(scheduledEnd.getTime() + 15 * 60000);
    const autoAdvanceTrigger = new Date(scheduledEnd.getTime() + 20 * 60000);

    const timeLeftMs = scheduledEnd.getTime() - now.getTime();
    const overtimeMinutes = Math.floor((now.getTime() - scheduledEnd.getTime()) / 60000);

    if (now < scheduledEnd) {
      return { text: `Finish Task (Ends in ${Math.ceil(timeLeftMs / 60000)} min)`, style: 'bg-indigo-600 hover:bg-indigo-700' };
    } else if (now >= scheduledEnd && now < overtimeTrigger) {
      return { text: `FINISH NOW (On Time Window!)`, style: 'bg-green-600 hover:bg-green-700 animate-pulse' };
    } else if (now >= overtimeTrigger && now < autoAdvanceTrigger) {
      return { text: `FINISH! (+${overtimeMinutes} min Overtime)`, style: 'bg-red-500 hover:bg-red-600 shadow-xl' };
    }
    return { text: 'Task Overdue (Auto-Advancing)', style: 'bg-gray-500 cursor-not-allowed' };

  }, [currentTime, currentTask]);


  return (
    <div className="p-4 sm:p-6 pb-20 bg-gray-100 min-h-screen">
      <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Today's Schedule</h2>
      <p className="text-sm text-indigo-600 font-medium mb-6">{dateDisplay} | {timeDisplay}</p>
      
      <AddScheduleForm userId={userId} db={db} schedules={schedules} setSchedules={setSchedules} />

      {currentTask ? (
        <div className="bg-white p-5 rounded-xl shadow-2xl border-t-8 border-indigo-500 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-bold text-gray-800">
              <span className="text-indigo-600 mr-2">
                {currentTime < timeStringToDate(currentTask.endTime) ? 'ACTIVE' : 'OVERTIME'}
              </span> 
              Task:
            </h3>
            <Clock className="w-6 h-6 text-indigo-500" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mb-3">{currentTask.activity}</p>
          <p className="text-sm text-gray-500 mb-4">
            {currentTask.startTime} to {currentTask.endTime}
          </p>
          
          <button
            onClick={currentTask ? handleFinished : undefined}
            disabled={!currentTask || finishButtonStatus.style.includes('cursor-not-allowed')}
            className={`w-full text-white py-3 rounded-xl font-bold transition duration-200 ${finishButtonStatus.style}`}
          >
            {finishButtonStatus.text}
          </button>
        </div>
      ) : (
        <div className="bg-white p-5 rounded-xl shadow-lg text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-gray-700">No active tasks right now!</p>
          <p className="text-sm text-gray-500">Time to relax or add your next activity.</p>
        </div>
      )}

      <button
        onClick={onShowHistory}
        className="fixed bottom-4 right-4 z-10 p-4 bg-indigo-500 text-white rounded-full shadow-lg hover:bg-indigo-600 transition"
      >
        <BarChart3 className="w-6 h-6" />
      </button>

      {/* Render the UI Notification */}
      {notificationState.isActive && (
        <ReminderNotification 
          currentTask={notificationState.currentTask} 
          nextTask={notificationState.nextTask} 
          onDismiss={handleFinished} 
        />
      )}
    </div>
  );
};

// Component for Profile and History View
const ProfileHistory = ({ profile, history, onGoHome }) => {
  return (
    <div className="p-4 sm:p-6 pb-20 bg-gray-100 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-extrabold text-gray-900">User Profile</h2>
        <button
          onClick={onGoHome}
          className="flex items-center text-indigo-600 font-semibold hover:text-indigo-800 transition"
        >
          <Home className="w-5 h-5 mr-1" />
          Home
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg mb-8 border-t-4 border-indigo-500">
        <p className="text-sm font-medium text-gray-500">Nickname</p>
        <p className="text-3xl font-bold text-indigo-600 mb-4">{profile.nickname}</p>

        <div className="space-y-3">
          <div className="flex justify-between border-b pb-2">
            <span className="font-semibold text-gray-700">Real Name:</span>
            <span className="text-gray-600">{profile.name}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-semibold text-gray-700">Birthday:</span>
            <span className="text-gray-600">{profile.birthday}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Notifications:</span>
            <span className={profile.notificationPermission === 'granted' ? 'text-green-500' : 'text-red-500'}>
              {profile.notificationPermission === 'granted' ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>
      
      <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <List className="w-5 h-5 mr-2 text-indigo-500" />
        Activity History
      </h3>
      
      <div className="space-y-3">
        {history.length === 0 && (
          <p className="text-gray-500 italic">No completed activities yet. Start scheduling!</p>
        )}
        {history.map((item, index) => (
          <div 
            key={item.id} 
            className="bg-white p-4 rounded-xl shadow-md flex justify-between items-center transition duration-150 hover:shadow-lg"
          >
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-800 truncate">{item.activity}</p>
              <p className="text-xs text-gray-500">
                Scheduled: {item.scheduledStart} - {item.scheduledEnd}
              </p>
              <p className="text-xs font-semibold">
                Finished: {item.actualEnd}
              </p>
            </div>
            <div className={`ml-4 px-3 py-1 text-sm font-bold rounded-full ${
              item.status === 'on-time' 
                ? 'bg-green-100 text-green-700 border border-green-300' 
                : 'bg-red-100 text-red-700 border border-red-300'
            }`}>
              {item.status === 'on-time' ? 'ON TIME' : 'OVERTIME'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// Main App Component
export default function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [profile, setProfile] = useState(null);
  const [schedules, setSchedules] = useState({ tasks: [] });
  const [history, setHistory] = useState([]);
  
  const [view, setView] = useState('loading'); // 'loading', 'permissions', 'setup', 'main', 'profile'
  const [initialNotificationStatus, setInitialNotificationStatus] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);

      setDb(firestore);
      setAuth(authInstance);

      // Auth Listener
      const unsubscribe = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // Fallback to anonymous sign-in if no user
          const performAuth = async () => {
             if (initialAuthToken) {
                 await signInWithCustomToken(authInstance, initialAuthToken);
             } else {
                 await signInAnonymously(authInstance);
             }
          };
          performAuth();
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setIsAuthReady(true);
    }
  }, []);

  // 2. Data Fetching (Profile, Schedules, History)
  useEffect(() => {
    if (!db || !userId || !isAuthReady) return;

    // --- Profile Listener ---
    const profileDocRef = doc(db, `artifacts/${appId}/users/${userId}/data/profile`, 'user_data');
    const unsubscribeProfile = onSnapshot(profileDocRef, (docSnap) => {
      const profileData = docSnap.data();
      if (profileData) {
        setProfile(profileData);
        if (view === 'loading' || view === 'setup' || view === 'permissions') {
          setView('main');
        }
      } else if (view === 'loading') {
        // If no profile, start onboarding flow
        setView('permissions');
      }
    }, (error) => console.error("Error fetching profile:", error));

    // --- Schedules Listener ---
    const scheduleDocRef = doc(db, `artifacts/${appId}/users/${userId}/data/schedules`, 'today');
    const unsubscribeSchedules = onSnapshot(scheduleDocRef, (docSnap) => {
      const scheduleData = docSnap.data();
      if (scheduleData && scheduleData.tasks) {
        // Sort tasks by start time
        const sortedTasks = scheduleData.tasks.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setSchedules({ tasks: sortedTasks });
      } else {
         setSchedules({ tasks: [] });
      }
    }, (error) => console.error("Error fetching schedules:", error));

    // --- History Listener (Ordered by Date/Time Desc) ---
    const historyQuery = query(collection(db, `artifacts/${appId}/users/${userId}/history/activities`));
    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      const historyList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Client-side sort by actualEnd time (approximate, since actualEnd is a string)
      historyList.sort((a, b) => b.actualEnd.localeCompare(a.actualEnd)); 
      setHistory(historyList);
    }, (error) => console.error("Error fetching history:", error));


    return () => {
      unsubscribeProfile();
      unsubscribeSchedules();
      unsubscribeHistory();
    };
  }, [db, userId, isAuthReady]);
  
  // --- Navigation & Onboarding Handlers ---
  const handlePermissionComplete = (granted) => {
    setInitialNotificationStatus(granted ? 'granted' : 'denied');
    setView('setup');
  };

  const handleProfileComplete = async (formData, notificationStatus) => {
    if (!db || !userId) return;
    try {
      const profileDocRef = doc(db, `artifacts/${appId}/users/${userId}/data/profile`, 'user_data');
      await setDoc(profileDocRef, { 
        ...formData, 
        userId, 
        notificationPermission: notificationStatus 
      });
      // Profile state will be updated by the listener
    } catch (e) {
      console.error("Error saving profile:", e);
    }
  };

  const currentNickname = profile ? profile.nickname : 'Guest';

  // --- Render Logic ---
  let content;

  if (view === 'loading' || !isAuthReady) {
    content = (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Clock className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="mt-4 text-gray-600 font-semibold">Loading Time Manipulation...</p>
      </div>
    );
  } else if (view === 'permissions') {
    content = <PermissionRequest onComplete={handlePermissionComplete} />;
  } else if (view === 'setup') {
    content = <ProfileSetup onComplete={handleProfileComplete} initialNotificationStatus={initialNotificationStatus} />;
  } else if (view === 'main' && profile) {
    content = <MainScheduler profile={profile} schedules={schedules} setSchedules={setSchedules} userId={userId} db={db} onShowHistory={() => setView('profile')} />;
  } else if (view === 'profile' && profile) {
    content = <ProfileHistory profile={profile} history={history} onGoHome={() => setView('main')} />;
  } else {
    // Should only happen if profile is unexpectedly null after setup
    content = <div className="p-8 text-center">Something went wrong. Please refresh.</div>;
  }

  // --- Main App Structure (Header and Content) ---
  return (
    <div className="max-w-xl mx-auto min-h-screen relative bg-gray-50 font-sans shadow-2xl">
      
      {/* Header (Top Right Menu) */}
      <header className="sticky top-0 z-40 bg-white shadow-md p-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {APP_ICON}
          <h1 className="text-xl font-extrabold text-indigo-700">{APP_NAME}</h1>
        </div>
        
        {/* Nickname Menu */}
        {profile && (
            <div className="relative">
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex items-center space-x-2 p-2 bg-indigo-100 rounded-full hover:bg-indigo-200 transition"
                >
                    <User className="w-5 h-5 text-indigo-600" />
                    <span className="font-bold text-indigo-700 hidden sm:inline">{currentNickname}</span>
                    <Menu className="w-5 h-5 text-indigo-600" />
                </button>

                {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl py-2 z-50 border border-gray-100">
                        <div className="px-4 py-2 text-xs font-bold text-gray-500 border-b">{currentNickname}'s Menu</div>
                        <button
                            onClick={() => { setView('main'); setIsMenuOpen(false); }}
                            className="w-full text-left flex items-center px-4 py-2 text-gray-700 hover:bg-indigo-50"
                        >
                            <Home className="w-4 h-4 mr-2" /> Main Scheduler
                        </button>
                        <button
                            onClick={() => { setView('profile'); setIsMenuOpen(false); }}
                            className="w-full text-left flex items-center px-4 py-2 text-gray-700 hover:bg-indigo-50"
                        >
                            <BarChart3 className="w-4 h-4 mr-2" /> Profile & History
                        </button>
                        <div className="border-t my-1"></div>
                        <button
                            onClick={() => { auth.signOut(); setProfile(null); setView('loading'); setIsMenuOpen(false); }}
                            className="w-full text-left flex items-center px-4 py-2 text-red-600 hover:bg-red-50"
                        >
                            <LogOut className="w-4 h-4 mr-2" /> Log Out
                        </button>
                    </div>
                )}
            </div>
        )}
      </header>
      
      {/* Main Content Area */}
      <main className="flex-1">
        {content}
      </main>

    </div>
  );
}



