import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, 
  where, addDoc, getDocs, updateDoc, Timestamp 
} from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore'; // Import for logging

// Lucide Icons (assuming available from dependencies)
import { Clock, Hand, User, List, LogOut, Plus, CheckCircle, XCircle, Settings, Menu, Award } from 'lucide-react';

// --- Global Setup (Read from Vercel Environment Variables) ---
// IMPORTANT: The app now relies on these environment variables being set in Vercel.
const firebaseConfigStr = process.env.REACT_APP_FIREBASE_CONFIG || '{}';
const initialAuthToken = process.env.REACT_APP_INITIAL_AUTH_TOKEN || '';
const appId = process.env.REACT_APP_APP_ID || 'time-manipulator';

// Motivational Phrases
const MOTIVATIONAL_PHRASES = [
  "Time is gold, don't waste it!", 
  "Keep it up, you can do it!", 
  "Amazing work done!", 
  "Cheer up! Clean it up!",
  "Every second counts!",
  "Your focus is your power!",
  "Make today great!",
  "The time to act is now!"
];

// Utility Functions
const pad = (num) => num.toString().padStart(2, '0');
const getMotivationalWord = () => MOTIVATIONAL_PHRASES[Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length)];

// Date and Time Formatting
const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

// --- Firebase Initialization and Auth Hook ---

function useFirebaseSetup() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setLogLevel('debug');
      const firebaseConfig = JSON.parse(firebaseConfigStr);
      if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is empty. Please set REACT_APP_FIREBASE_CONFIG in Vercel.");
        setLoading(false);
        return;
      }
      
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setLoading(false);
        } else {
          // Attempt sign-in with custom token or anonymously
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Auth failed:", error);
            setLoading(false);
          }
        }
      });

      // Cleanup subscription on unmount
      return () => unsubscribe();
      
    } catch (error) {
      console.error("Firebase Setup Error:", error);
      setLoading(false);
    }
  }, []);

  return { db, auth, userId, loading };
}

// --- Firestore Hooks ---

const useFirestoreDocument = (db, userId, collectionName, docId) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!db || !userId) return;
    
    const docRef = doc(db, 'artifacts', appId, 'users', userId, collectionName, docId);

    const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        setData(docSnapshot.data());
      } else {
        setData(null);
      }
    }, (error) => {
      console.error(`Error listening to ${collectionName}/${docId}:`, error);
    });

    return () => unsubscribe();
  }, [db, userId, collectionName, docId]);

  return data;
};

const useFirestoreCollection = (db, userId, collectionName) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!db || !userId) return;
    
    // Path: /artifacts/{appId}/users/{userId}/schedules
    const collectionPath = `artifacts/${appId}/users/${userId}/${collectionName}`;
    const q = query(collection(db, collectionPath));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() });
      });
      // Sort schedules by startTime string
      if (collectionName === 'schedules') {
        items.sort((a, b) => (a.startTime > b.startTime) ? 1 : -1);
      }
      // Sort history by finishedAt date (descending)
      if (collectionName === 'history') {
         items.sort((a, b) => b.finishedAt?.toDate().getTime() - a.finishedAt?.toDate().getTime());
      }
      setData(items);
    }, (error) => {
      console.error(`Error listening to collection ${collectionName}:`, error);
    });

    return () => unsubscribe();
  }, [db, userId, collectionName]);

  return data;
};

// --- Main App Component ---

export default function App() {
  const { db, userId, loading } = useFirebaseSetup();
  const [view, setView] = useState('main'); // 'main', 'profile', 'schedule'
  const [showNotification, setShowNotification] = useState(null); // { message, nextTask }
  const [currentTime, setCurrentTime] = useState(new Date());

  // Data Hooks
  const userProfile = useFirestoreDocument(db, userId, 'profile', 'user');
  const schedules = useFirestoreCollection(db, userId, 'schedules');
  const history = useFirestoreCollection(db, userId, 'history');
  
  // State for Onboarding/Profile Setup
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', nickname: '', birthday: '' });

  // Schedule Input State
  const [scheduleForm, setScheduleForm] = useState({ name: '', startTime: '09:00', endTime: '10:00' });
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Constants
  const OVERTIME_GRACE_MINUTES = 15; // 15 minutes grace period
  const OVERTIME_TRIGGER_MINUTES = 20; // Task is marked OVERTIME and auto-advances at 20 minutes past due

  // 1. Check for profile status and open modal if needed
  useEffect(() => {
    if (!loading && userId && userProfile === null) {
      setIsProfileModalOpen(true);
    }
  }, [loading, userId, userProfile]);

  // 2. Clock update interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Current Schedule Calculation and Notification Logic
  const activeSchedule = useMemo(() => {
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // 1. Find the current running task
    let currentTask = schedules.find(s => {
      const startMinutes = parseInt(s.startTime.split(':')[0]) * 60 + parseInt(s.startTime.split(':')[1]);
      const endMinutes = parseInt(s.endTime.split(':')[0]) * 60 + parseInt(s.endTime.split(':')[1]);
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    });

    if (currentTask) {
      return { ...currentTask, status: 'RUNNING' };
    }

    // 2. Find the task that just ended, or is overdue (potential for finish button logic)
    const overdueTask = schedules.find(s => {
      const endMinutes = parseInt(s.endTime.split(':')[0]) * 60 + parseInt(s.endTime.split(':')[1]);
      const graceEndMinutes = endMinutes + OVERTIME_GRACE_MINUTES;
      const autoAdvanceMinutes = endMinutes + OVERTIME_TRIGGER_MINUTES;

      // Check if we are in the grace or overdue period
      if (nowMinutes >= endMinutes && nowMinutes < autoAdvanceMinutes) {
        
        // --- AUTO-ADVANCE / OVERTIME LOGIC ---
        // If 20 minutes have passed, automatically log as Overtime and clear the schedule
        if (nowMinutes >= autoAdvanceMinutes && db) {
          handleFinishTask(s.id, 'OVERTIME');
          return;
        }

        const nextSchedule = schedules.find(next => 
          (parseInt(next.startTime.split(':')[0]) * 60 + parseInt(next.startTime.split(':')[1])) >= autoAdvanceMinutes
        );

        // --- NOTIFICATION POPUP LOGIC ---
        // Show notification once exactly at the end time
        if (nowMinutes === endMinutes && !showNotification && !localStorage.getItem(`notified-${s.id}`)) {
          localStorage.setItem(`notified-${s.id}`, 'true');
          setShowNotification({
            message: `${getMotivationalWord()}! Your '${s.name}' task is due.`,
            nextTask: nextSchedule ? `Next up: ${nextSchedule.name} at ${nextSchedule.startTime}` : 'You have no more scheduled tasks.'
          });
        }
        
        // Set the status for the finish button
        const status = nowMinutes <= graceEndMinutes ? 'ON_TIME_WINDOW' : 'OVERDUE';
        
        return { 
          ...s, 
          status, 
          minutesPastDue: nowMinutes - endMinutes
        };
      }
      return false;
    });

    // 3. Return the task that needs attention (running or overdue)
    return currentTask ? { ...currentTask, status: 'RUNNING' } : (overdueTask || null);

  }, [currentTime, schedules, showNotification, db]); // Include db to allow auto-advance logic

  // --- HANDLERS ---

  // Request Notification permission on first load
  const requestPermissions = () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notification");
      return;
    }
    Notification.requestPermission().then((permission) => {
      console.log(`Notification permission status: ${permission}`);
      // Calendar permission is usually managed by the user's OS or specific APIs, we'll log it here.
    });
  };

  // Profile Setup Submission
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!db || !userId) return;

    try {
      const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profile', 'user');
      await setDoc(profileRef, {
        name: profileForm.name,
        nickname: profileForm.nickname,
        birthday: profileForm.birthday,
        createdAt: Timestamp.now(),
      }, { merge: true });

      setIsProfileModalOpen(false);
    } catch (error) {
      console.error("Error saving profile:", error);
    }
  };

  // Schedule Submission
  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!db || !userId) return;

    try {
      const schedulesRef = collection(db, 'artifacts', appId, 'users', userId, 'schedules');
      await addDoc(schedulesRef, {
        name: scheduleForm.name,
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        createdAt: Timestamp.now(),
      });
      setIsScheduleModalOpen(false);
      setScheduleForm({ name: '', startTime: '09:00', endTime: '10:00' });
    } catch (error) {
      console.error("Error adding schedule:", error);
    }
  };

  // Finish Task Handler (triggered by button or auto-advance)
  const handleFinishTask = async (taskId, statusOverride) => {
    if (!db || !userId || !taskId) return;
    
    const task = schedules.find(s => s.id === taskId);
    if (!task) return;

    const finishedAt = new Date();
    const endMinutes = parseInt(task.endTime.split(':')[0]) * 60 + parseInt(task.endTime.split(':')[1]);
    const finishedMinutes = finishedAt.getHours() * 60 + finishedAt.getMinutes();
    const isOvertime = statusOverride === 'OVERTIME' || finishedMinutes > (endMinutes + OVERTIME_GRACE_MINUTES);
    
    // 1. Add to History
    try {
      const historyRef = collection(db, 'artifacts', appId, 'users', userId, 'history');
      await addDoc(historyRef, {
        name: task.name,
        scheduledStartTime: task.startTime,
        scheduledEndTime: task.endTime,
        finishedAt: Timestamp.fromDate(finishedAt),
        status: isOvertime ? 'OVERTIME' : 'ON TIME',
        durationMinutes: finishedMinutes - (parseInt(task.startTime.split(':')[0]) * 60 + parseInt(task.startTime.split(':')[1]))
      });
      // Clear notification and local storage flag
      setShowNotification(null);
      localStorage.removeItem(`notified-${taskId}`);
    } catch (error) {
      console.error("Error adding to history:", error);
      // Even if history fails, try to delete the schedule
    }

    // 2. Remove from Schedules
    try {
      const scheduleDocRef = doc(db, 'artifacts', appId, 'users', userId, 'schedules', taskId);
      await deleteDoc(scheduleDocRef);
    } catch (error) {
      console.error("Error deleting schedule:", error);
    }
  };

  // --- RENDER COMPONENTS ---

  const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-800">
      <div className="animate-spin text-indigo-600 mb-4">
        <Clock size={48} />
      </div>
      <h1 className="text-3xl font-serif font-bold tracking-tight">Time Manipulation</h1>
      <p className="mt-2 text-lg">Loading Time Manipulation...</p>
      {/* If loading is true but userId is null, suggest issue */}
      {!userId && !loading && (
        <p className="mt-4 text-red-500 text-sm p-3 border border-red-300 rounded-lg">
          Error: Failed to authenticate. Check Vercel environment variables (FIREBASE_CONFIG & AUTH_TOKEN).
        </p>
      )}
    </div>
  );

  const ProfileSetupModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-4 text-indigo-700">Welcome! Let's get set up.</h2>
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-semibold text-red-500">First, click here:</span>
          <button onClick={requestPermissions} className="ml-2 px-3 py-1 bg-indigo-100 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-200 transition">
            Request Permissions (Notifications)
          </button>
        </p>
        <form onSubmit={handleProfileSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Desired Nickname</label>
            <input
              type="text"
              required
              value={profileForm.nickname}
              onChange={(e) => setProfileForm({ ...profileForm, nickname: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Birthday</label>
            <input
              type="date"
              required
              value={profileForm.birthday}
              onChange={(e) => setProfileForm({ ...profileForm, birthday: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white p-3 rounded-lg font-semibold hover:bg-indigo-700 transition shadow-md"
          >
            Start Time Manipulating
          </button>
        </form>
      </div>
    </div>
  );

  const ScheduleModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-4 text-indigo-700">Add New Schedule</h2>
        <form onSubmit={handleScheduleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Name</label>
            <input
              type="text"
              required
              value={scheduleForm.name}
              onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex space-x-4 mb-6">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                required
                value={scheduleForm.startTime}
                onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Finish Time</label>
              <input
                type="time"
                required
                value={scheduleForm.endTime}
                onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(false)}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition shadow-md"
            >
              Add Activity
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const HistoryItem = ({ item }) => {
    const isOvertime = item.status === 'OVERTIME';
    const finishedTime = item.finishedAt ? formatTime(item.finishedAt.toDate()) : 'N/A';
    
    return (
      <div className={`p-4 rounded-xl mb-3 shadow-md transition ${isOvertime ? 'bg-red-50 border-l-4 border-red-500' : 'bg-green-50 border-l-4 border-green-500'}`}>
        <div className="flex justify-between items-center">
          <h4 className={`font-bold text-lg ${isOvertime ? 'text-red-700' : 'text-green-700'}`}>{item.name}</h4>
          <span className={`text-sm font-semibold p-1 rounded-full px-3 ${isOvertime ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
            {item.status}
          </span>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Scheduled: <span className="font-mono text-xs">{item.scheduledStartTime} - {item.scheduledEndTime}</span>
        </p>
        <p className="text-sm text-gray-600">
          Finished: <span className="font-mono text-xs">{finishedTime}</span> | 
          Actual Duration: {formatMinutes(item.durationMinutes)}
        </p>
      </div>
    );
  };

  const ProfileView = () => (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto bg-white min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-extrabold text-indigo-700">
          <User className="inline mr-2" /> {userProfile?.nickname}'s Profile
        </h2>
        <button 
          onClick={() => setView('main')}
          className="text-indigo-600 hover:text-indigo-800 transition font-semibold"
        >
          <Clock className="inline mr-1" size={20} /> Back to Main
        </button>
      </div>
      
      <div className="bg-indigo-50 p-6 rounded-xl shadow-lg mb-8">
        <h3 className="text-xl font-bold mb-3 text-indigo-800">Personal Details</h3>
        <p className="text-gray-700"><span className="font-semibold w-20 inline-block">Real Name:</span> {userProfile?.name || 'N/A'}</p>
        <p className="text-gray-700"><span className="font-semibold w-20 inline-block">Birthday:</span> {userProfile?.birthday || 'N/A'}</p>
        <p className="text-gray-700"><span className="font-semibold w-20 inline-block">User ID:</span> <code className="text-xs break-all">{userId}</code></p>
      </div>
      
      <div className="mt-8">
        <h3 className="text-2xl font-bold text-indigo-700 mb-4 border-b pb-2">Activity History</h3>
        {history.length === 0 ? (
          <p className="text-gray-500 italic p-4 bg-gray-100 rounded-lg">No activities recorded yet. Start scheduling!</p>
        ) : (
          history.map(item => <HistoryItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );

  const MainView = () => (
    <div className="p-4 sm:p-8 max-w-xl mx-auto min-h-screen flex flex-col bg-gray-50">
      
      {/* Header and Menu */}
      <header className="flex justify-between items-center py-4 border-b border-indigo-200">
        <h1 className="text-3xl font-extrabold text-indigo-700 flex items-center">
          <Clock size={28} className="mr-2 text-indigo-500" />
          Time Manipulation
        </h1>
        <div className="relative group">
          <button 
            className="flex items-center space-x-2 p-2 bg-indigo-600 text-white rounded-full shadow-md hover:bg-indigo-700 transition"
          >
            <User size={20} />
            <span className="font-semibold text-sm">{userProfile?.nickname || 'Guest'}</span>
            <Menu size={16} />
          </button>
          {/* Menu Dropdown */}
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button 
              onClick={() => setView('profile')}
              className="flex items-center w-full p-3 text-left text-gray-700 hover:bg-indigo-50 rounded-t-lg"
            >
              <User size={18} className="mr-2"/> View Profile & History
            </button>
            <div className="border-t border-gray-100"></div>
            <button 
              onClick={() => { console.log('Log out not implemented.'); }}
              className="flex items-center w-full p-3 text-left text-red-600 hover:bg-red-50 rounded-b-lg"
            >
              <LogOut size={18} className="mr-2"/> Log Out (Not active)
            </button>
          </div>
        </div>
      </header>

      {/* Clock and Status */}
      <div className="mt-6 text-center">
        <p className="text-5xl font-mono font-bold text-indigo-800">{formatTime(currentTime)}</p>
        <p className="text-sm text-gray-500">{currentTime.toDateString()}</p>
      </div>
      
      {/* Active Schedule Panel */}
      <div className="mt-8 p-6 bg-white rounded-xl shadow-lg border-t-4 border-indigo-500">
        {activeSchedule ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-indigo-500 uppercase">
              {activeSchedule.status === 'RUNNING' ? 'Currently Active' : 
               activeSchedule.status === 'ON_TIME_WINDOW' ? 'Time to Finish!' : 'Overdue Task'}
            </p>
            <h2 className="text-3xl font-bold text-gray-800 my-2">{activeSchedule.name}</h2>
            <p className="text-md text-gray-600 font-mono">
              Scheduled: {activeSchedule.startTime} – {activeSchedule.endTime}
            </p>

            {/* Finish Button Logic */}
            <button
              onClick={() => handleFinishTask(activeSchedule.id)}
              className={`mt-4 w-full p-3 text-white font-bold rounded-lg transition transform shadow-md 
                ${activeSchedule.status === 'RUNNING' || activeSchedule.status === 'ON_TIME_WINDOW'
                  ? 'bg-green-500 hover:bg-green-600 active:scale-[.98]'
                  : 'bg-red-500 hover:bg-red-600 active:scale-[.98]'
                }`
              }
            >
              <CheckCircle size={20} className="inline mr-2" />
              {activeSchedule.status === 'RUNNING' ? `FINISH NOW` :
               activeSchedule.status === 'ON_TIME_WINDOW' ? `FINISH (ON TIME)` : 
               `FINISH (OVERDUE: +${activeSchedule.minutesPastDue} min)`}
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500 text-lg">No active task right now. Relax or schedule one!</p>
          </div>
        )}
      </div>

      {/* Next Schedule List (Up to 3) */}
      <div className="mt-6">
        <h3 className="text-xl font-bold text-gray-700 mb-3 flex items-center">
          <List size={20} className="mr-2"/> Upcoming Schedules
        </h3>
        {schedules.slice(0, 3).map(s => (
          <div key={s.id} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm mb-2 border-l-4 border-indigo-400">
            <span className="font-medium text-gray-800">{s.name}</span>
            <span className="font-mono text-sm text-indigo-600">{s.startTime} – {s.endTime}</span>
          </div>
        ))}
        {schedules.length > 3 && (
          <p className="text-sm text-gray-500 mt-2 text-center">and {schedules.length - 3} more...</p>
        )}
      </div>

      {/* Add Schedule Button (Fixed at bottom right) */}
      <button
        onClick={() => setIsScheduleModalOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 transition transform hover:scale-105"
        title="Add New Schedule"
      >
        <Plus size={24} />
      </button>

      {/* Notification Popup (Local UI Notification) */}
      {showNotification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 p-4 w-11/12 max-w-sm bg-yellow-100 border border-yellow-400 rounded-xl shadow-2xl z-50 animate-pulse">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-bold text-yellow-700 mb-1">{showNotification.message}</p>
              <p className="text-sm text-yellow-600">{showNotification.nextTask}</p>
            </div>
            <button onClick={() => setShowNotification(null)} className="text-yellow-700 hover:text-yellow-900 ml-4">
              <XCircle size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // --- Main Render Logic ---

  if (loading) {
    return <LoadingScreen />;
  }

  if (isProfileModalOpen || userProfile === null) {
    return <ProfileSetupModal />;
  }

  return (
    <div className="font-sans antialiased text-gray-800 bg-gray-50 min-h-screen">
      {view === 'main' && <MainView />}
      {view === 'profile' && <ProfileView />}
      {isScheduleModalOpen && <ScheduleModal />}
    </div>
  );
}

