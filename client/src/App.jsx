import React, { useState } from 'react';
import AppShell from './components/AppShell';

export default function App() {
  // key forces a full remount on "New Session"
  const [sessionKey, setSessionKey] = useState(0);

  return (
    <AppShell
      key={sessionKey}
      onNewSession={() => setSessionKey((k) => k + 1)}
    />
  );
}
