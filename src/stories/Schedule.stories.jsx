import Schedule from '../components/Schedule';

const now = new Date();
const future = (days) => new Date(now.getTime() + days * 86400000).toISOString();
const past = (days) => new Date(now.getTime() - days * 86400000).toISOString();

const mockUpcoming = [
  {
    id: '1',
    title: 'Practice',
    eventType: 'practice',
    date: future(1),
    startTime: '17:00',
    endTime: '18:30',
    location: 'City Park Field 3',
  },
  {
    id: '2',
    title: 'vs Metairie FC',
    eventType: 'game',
    date: future(3),
    startTime: '10:00',
    endTime: '11:30',
    location: 'Pan American Stadium',
    description: 'League match - bring white jerseys',
  },
  {
    id: '3',
    title: 'Spring Tournament',
    eventType: 'tournament',
    date: future(7),
    startTime: '08:00',
    endTime: '17:00',
    location: 'Lafreniere Park',
  },
  {
    id: '4',
    title: 'Team Meeting',
    eventType: 'event',
    date: future(10),
    startTime: '18:00',
    endTime: '19:00',
    location: 'Community Center',
  },
];

const mockPast = [
  {
    id: '5',
    title: 'Practice',
    eventType: 'practice',
    date: past(2),
    startTime: '17:00',
    endTime: '18:30',
    location: 'City Park Field 3',
  },
  {
    id: '6',
    title: 'vs Kenner Stars',
    eventType: 'game',
    date: past(5),
    startTime: '09:00',
    endTime: '10:30',
    location: 'Muss Bertolino Stadium',
    isCancelled: true,
  },
];

export default {
  title: 'Components/Schedule',
  component: Schedule,
};

export const WithEvents = {
  args: {
    events: {
      upcoming: mockUpcoming,
      past: mockPast,
    },
  },
};

export const NoUpcoming = {
  args: {
    events: {
      upcoming: [],
      past: mockPast,
    },
  },
};

export const Empty = {
  args: {
    events: {
      upcoming: [],
      past: [],
    },
  },
};
