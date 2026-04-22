import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown, Menu, Calendar, Users, TrendingUp, Award, ExternalLink, Filter } from 'lucide-react';

// ===== AIRTABLE CONFIGURATION =====
const AIRTABLE_CONFIG = {
  token: process.env.REACT_APP_AIRTABLE_TOKEN || 'YOUR_TOKEN_HERE',
  baseId: process.env.REACT_APP_AIRTABLE_BASE_ID || 'YOUR_BASE_ID',
  tables: {
    players: process.env.REACT_APP_PLAYERS_TABLE_ID || 'Players',
    commitments: process.env.REACT_APP_COMMITMENTS_TABLE_ID || 'Commitments',
    transfers: process.env.REACT_APP_TRANSFERS_TABLE_ID || 'Transfers',
    prePortal: process.env.REACT_APP_PREPORTAL_TABLE_ID || 'Pre-Portal Announcements'
  }
};

// ===== AIRTABLE API UTILITIES =====
const fetchAirtableTable = async (tableName) => {
  const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableName}`;
  let allRecords = [];
  let offset = null;

  try {
    do {
      const params = new URLSearchParams();
      if (offset) params.append('offset', offset);
      
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_CONFIG.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error(`Airtable API error: ${response.status}`);
      
      const data = await response.json();
      allRecords = [...allRecords, ...data.records];
      offset = data.offset;
    } while (offset);

    return allRecords;
  } catch (error) {
    console.error(`Error fetching ${tableName}:`, error);
    throw error;
  }
};

const useAirtableData = () => {
  const [data, setData] = useState({
    players: [],
    commitments: [],
    transfers: [],
    prePortal: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchData = async () => {
      const cacheKey = 'wsoc_data';
      const cacheTimeKey = 'wsoc_data_time';
      const cacheDuration = 5 * 60 * 1000; // 5 minutes

      // Check cache
      const cachedData = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(cacheTimeKey);
      
      if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime) < cacheDuration)) {
        setData({ ...JSON.parse(cachedData), loading: false, error: null });
        return;
      }

      try {
        const [players, commitments, transfers, prePortal] = await Promise.all([
          fetchAirtableTable(AIRTABLE_CONFIG.tables.players),
          fetchAirtableTable(AIRTABLE_CONFIG.tables.commitments),
          fetchAirtableTable(AIRTABLE_CONFIG.tables.transfers),
          fetchAirtableTable(AIRTABLE_CONFIG.tables.prePortal)
        ]);

        const newData = { players, commitments, transfers, prePortal };
        
        // Cache the data
        localStorage.setItem(cacheKey, JSON.stringify(newData));
        localStorage.setItem(cacheTimeKey, Date.now().toString());

        setData({ ...newData, loading: false, error: null });
      } catch (error) {
        setData(prev => ({ ...prev, loading: false, error: error.message }));
      }
    };

    fetchData();
  }, []);

  return data;
};

// ===== UTILITY FUNCTIONS =====
const getPlayerFromLinkedRecord = (linkedRecordIds, playersData) => {
  if (!linkedRecordIds || linkedRecordIds.length === 0) return null;
  const playerId = linkedRecordIds[0];
  return playersData.find(p => p.id === playerId);
};

const isPlayerClickable = (player) => {
  if (!player) return false;
  const fields = player.fields || player;
  // FIX #1: Make players with contact info OR highlights clickable
  return !!(
    fields['Highlight URL'] || 
    fields['Player Photo URL'] ||
    fields['X Handle'] ||
    fields['Instagram Handle'] ||
    fields['Email']
  );
};

const getYouTubeEmbedUrl = (url) => {
  if (!url) return null;
  
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
  if (youtubeMatch) return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  
  // Hudl
  if (url.includes('hudl.com')) {
    const hudlMatch = url.match(/hudl\.com\/.*\/([a-zA-Z0-9]+)/);
    if (hudlMatch) return url; // Hudl embeds work with direct URL in iframe
  }
  
  return url;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  
  // Handle if dateString is already a Date object
  if (dateString instanceof Date) {
    if (isNaN(dateString.getTime())) return '';
    return dateString.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  
  // Convert to string if needed
  const dateStr = String(dateString).trim();
  
  // Handle ISO format with time (YYYY-MM-DDTHH:MM:SS)
  if (dateStr.includes('T')) {
    const [datePart] = dateStr.split('T');
    const parts = datePart.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }
    }
  }
  
  // Parse date components to avoid timezone issues
  // Airtable returns dates as "YYYY-MM-DD"
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';
  
  const date = new Date(year, month - 1, day); // month is 0-indexed
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getSchoolInitials = (schoolName) => {
  if (!schoolName) return '??';
  return schoolName
    .split(' ')
    .filter(word => word.length > 0 && !['of', 'the', 'and'].includes(word.toLowerCase()))
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
};

// ===== MAIN APP COMPONENT =====
export default function WSOCRecruits() {
  const [currentPage, setCurrentPage] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const airtableData = useAirtableData();

  const handlePlayerClick = (playerRecord) => {
    if (isPlayerClickable(playerRecord)) {
      setSelectedPlayer(playerRecord);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--navy)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-body)'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');

        :root {
          --purple: #7b3ff2;
          --cyan: #00d9ff;
          --orange: #ff8c42;
          --navy: #0a1628;
          --text-primary: #ffffff;
          --text-secondary: #a0aec0;
          --font-display: 'Bebas Neue', sans-serif;
          --font-body: 'Inter', -apple-system, sans-serif;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        .gradient-text {
          background: linear-gradient(135deg, var(--purple), var(--cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .clickable-name {
          cursor: pointer;
          color: var(--cyan);
          text-decoration: none;
          transition: all 0.2s ease;
          border-bottom: 2px solid transparent;
        }

        .clickable-name:hover {
          color: var(--purple);
          border-bottom-color: var(--purple);
        }

        .card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(123, 63, 242, 0.3);
        }

        .diagonal-stripe {
          position: absolute;
          width: 200%;
          height: 4px;
          background: linear-gradient(90deg, var(--purple), var(--cyan), var(--orange));
          transform: rotate(-3deg);
          opacity: 0.3;
        }

        .position-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .position-GK { background: rgba(255, 140, 66, 0.2); color: var(--orange); }
        .position-DEF { background: rgba(123, 63, 242, 0.2); color: var(--purple); }
        .position-MID { background: rgba(0, 217, 255, 0.2); color: var(--cyan); }
        .position-FWD { background: rgba(255, 140, 66, 0.2); color: var(--orange); }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-in {
          animation: slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        @media (max-width: 768px) {
          .mobile-menu {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 80%;
            max-width: 300px;
            background: var(--navy);
            border-left: 2px solid var(--purple);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            z-index: 1000;
          }

          .mobile-menu.open {
            transform: translateX(0);
          }
        }

        .video-wrapper {
          position: relative;
          padding-bottom: 56.25%;
          height: 0;
          overflow: hidden;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.3);
        }

        .video-wrapper iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
        }

        .loading-spinner {
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top: 3px solid var(--cyan);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .school-logo {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
          background: linear-gradient(135deg, var(--purple), var(--cyan));
          color: white;
          flex-shrink: 0;
        }

        .arrow-graphic {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--cyan);
          font-weight: 600;
        }

        .arrow-graphic::after {
          content: '→';
          font-size: 24px;
          color: var(--cyan);
        }
      `}</style>

      <Header 
        onNavigate={setCurrentPage} 
        currentPage={currentPage}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <>
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              zIndex: 999
            }}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '80%',
            maxWidth: '300px',
            background: 'var(--navy)',
            borderLeft: '2px solid var(--purple)',
            zIndex: 1000,
            padding: '80px 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}>
            <button
              onClick={() => {
                setCurrentPage('home');
                setMobileMenuOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: currentPage === 'home' ? 'var(--cyan)' : 'white',
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '12px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              HOME
            </button>
            <button
              onClick={() => {
                setCurrentPage('commitments');
                setMobileMenuOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: currentPage === 'commitments' ? 'var(--cyan)' : 'white',
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '12px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              COMMITMENTS
            </button>
            <button
              onClick={() => {
                setCurrentPage('transfers');
                setMobileMenuOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: currentPage === 'transfers' ? 'var(--cyan)' : 'white',
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '12px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              TRANSFERS
            </button>
            <button
              onClick={() => {
                setCurrentPage('preportal');
                setMobileMenuOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: currentPage === 'preportal' ? 'var(--cyan)' : 'white',
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '12px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              PORTAL WATCH
            </button>
            <button
              onClick={() => {
                setCurrentPage('resources');
                setMobileMenuOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: currentPage === 'resources' ? 'var(--cyan)' : 'white',
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '12px 0'
              }}
            >
              RESOURCES
            </button>
          </div>
        </>
      )}

      <main style={{ paddingTop: '140px' }}>
        {airtableData.loading && <LoadingState />}
        {airtableData.error && <ErrorState error={airtableData.error} />}
        
        {!airtableData.loading && !airtableData.error && (
          <>
            {currentPage === 'home' && (
              <HomePage 
                data={airtableData} 
                onNavigate={setCurrentPage}
                onPlayerClick={handlePlayerClick}
              />
            )}
            {currentPage === 'commitments' && (
              <CommitmentsPage 
                data={airtableData}
                onPlayerClick={handlePlayerClick}
              />
            )}
            {currentPage === 'transfers' && (
              <TransfersPage 
                data={airtableData}
                onPlayerClick={handlePlayerClick}
              />
            )}
            {currentPage === 'preportal' && (
              <PrePortalPage 
                data={airtableData}
                onPlayerClick={handlePlayerClick}
              />
            )}
            {currentPage === 'resources' && (
              <ResourcesPage />
            )}
          </>
        )}
      </main>

      {selectedPlayer && (
        <PlayerModal 
          player={selectedPlayer}
          data={airtableData}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <Footer />
    </div>
  );
}

// ===== HEADER COMPONENT =====
function Header({ onNavigate, currentPage, searchQuery, setSearchQuery, mobileMenuOpen, setMobileMenuOpen }) {
  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'rgba(10, 22, 40, 0.95)',
      backdropFilter: 'blur(10px)',
      borderBottom: '2px solid rgba(123, 63, 242, 0.3)',
      padding: '16px 24px',
      zIndex: 100
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }} onClick={() => onNavigate('home')}>
          <img 
            src="/wsocrecruits-logo.png" 
            alt="WSOC Recruits Logo" 
            style={{ height: '120px', width: 'auto' }}
          />
        </div>

        <nav style={{ display: 'flex', gap: '32px', alignItems: 'center' }} className="desktop-nav">
          <NavLink active={currentPage === 'home'} onClick={() => onNavigate('home')}>Home</NavLink>
          <NavLink active={currentPage === 'commitments'} onClick={() => onNavigate('commitments')}>Commitments</NavLink>
          <NavLink active={currentPage === 'transfers'} onClick={() => onNavigate('transfers')}>Transfers</NavLink>
          <NavLink active={currentPage === 'preportal'} onClick={() => onNavigate('preportal')}>Portal Watch</NavLink>
          <NavLink active={currentPage === 'resources'} onClick={() => onNavigate('resources')}>Resources</NavLink>
        </nav>

        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '8px'
          }}
          className="mobile-menu-button"
        >
          <Menu size={28} />
        </button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-button {
            display: block !important;
          }
        }
      `}</style>
    </header>
  );
}

function NavLink({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: active ? 'var(--cyan)' : 'white',
        fontFamily: 'var(--font-display)',
        fontWeight: '400',
        fontSize: '18px',
        cursor: 'pointer',
        padding: '8px 0',
        borderBottom: active ? '2px solid var(--cyan)' : '2px solid transparent',
        transition: 'all 0.2s ease',
        letterSpacing: '1px'
      }}
    >
      {children}
    </button>
  );
}

// ===== HOME PAGE =====
function HomePage({ data, onNavigate, onPlayerClick }) {
  const stats = useMemo(() => {
    const currentYearCommitments = data.commitments.filter(c => 
      c.fields.Status === 'Current Cycle'
    ).length;

    const currentYearTransfers = data.transfers.filter(t => 
      t.fields.Status === 'Current Cycle'
    ).length;

    const activePrePortal = data.prePortal.length;
    const totalPlayers = data.players.length;

    return { currentYearCommitments, currentYearTransfers, activePrePortal, totalPlayers };
  }, [data]);

  const latestActivity = useMemo(() => {
    const activities = [];

    data.commitments.forEach(c => {
      const player = getPlayerFromLinkedRecord(c.fields.Player, data.players);
      if (player && c.fields['Commitment Date']) {
        activities.push({
          type: 'commitment',
          date: new Date(c.fields['Commitment Date']),
          player,
          school: c.fields['Committed School'],
          record: c
        });
      }
    });

    data.transfers.forEach(t => {
      const player = getPlayerFromLinkedRecord(t.fields.Player, data.players);
      if (player && t.fields['Transfer Date']) {
        activities.push({
          type: 'transfer',
          date: new Date(t.fields['Transfer Date']),
          player,
          previousSchool: t.fields['Previous School'],
          newSchool: t.fields['New School'],
          record: t
        });
      }
    });

    data.prePortal.forEach(p => {
      const player = getPlayerFromLinkedRecord(p.fields.Player, data.players);
      if (player && p.fields['Announcement Date']) {
        activities.push({
          type: 'preportal',
          date: new Date(p.fields['Announcement Date']),
          player,
          currentSchool: p.fields['Current School'],
          record: p
        });
      }
    });

    return activities.sort((a, b) => b.date - a.date).slice(0, 10);
  }, [data]);

  return (
    <div>
      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(135deg, rgba(123, 63, 242, 0.1), rgba(0, 217, 255, 0.1))',
        padding: '80px 24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div className="diagonal-stripe" style={{ top: '20%' }} />
        <div className="diagonal-stripe" style={{ bottom: '30%' }} />
        
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(40px, 8vw, 72px)',
            marginBottom: '24px',
            lineHeight: 1.1,
            letterSpacing: '1px'
          }}>
            YOUR HUB FOR<br />
            <span className="gradient-text">WOMEN'S COLLEGE SOCCER</span><br />
            RECRUITING
          </h1>
          
          <p style={{
            fontSize: '18px',
            color: 'var(--text-secondary)',
            maxWidth: '700px',
            margin: '0 auto 32px',
            lineHeight: 1.6
          }}>
            Comprehensive tracking of commitments, transfers, and portal announcements.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '40px' }}>
            <CTAButton onClick={() => onNavigate('commitments')} primary>
              View Commitments
            </CTAButton>
            <CTAButton onClick={() => onNavigate('transfers')}>
              Transfers
            </CTAButton>
            <CTAButton onClick={() => onNavigate('preportal')}>
              Portal Watch
            </CTAButton>
          </div>
        </div>
      </section>

      {/* Stats Dashboard */}
      <section style={{ padding: '60px 24px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '24px'
        }}>
          <StatCard 
            icon={<Award size={32} />}
            value={stats.currentYearCommitments}
            label="HS Commitments"
            subtitle="Current Cycle"
            color="var(--orange)"
          />
          <StatCard 
            icon={<TrendingUp size={32} />}
            value={stats.currentYearTransfers}
            label="Completed Transfers"
            subtitle="Current Cycle"
            color="var(--purple)"
          />
          <StatCard 
            icon={<Calendar size={32} />}
            value={stats.activePrePortal}
            label="Portal Watch"
            subtitle="Active Announcements"
            color="var(--cyan)"
          />
          <StatCard 
            icon={<Users size={32} />}
            value={stats.totalPlayers}
            label="Players Tracked"
            subtitle="Database"
            color="var(--orange)"
          />
        </div>
      </section>

      {/* Latest Activity Feed */}
      <section style={{ padding: '60px 24px', maxWidth: '1400px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '36px',
          marginBottom: '32px',
          letterSpacing: '1px'
        }}>
          LATEST <span className="gradient-text">ACTIVITY</span>
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {latestActivity.map((activity, idx) => (
            <ActivityCard 
              key={idx} 
              activity={activity} 
              onPlayerClick={onPlayerClick}
              style={{ animationDelay: `${idx * 0.05}s` }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, value, label, subtitle, color }) {
  return (
    <div className="card-hover" style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: `2px solid ${color}33`,
      borderRadius: '16px',
      padding: '32px',
      textAlign: 'center'
    }}>
      <div style={{ color, marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '48px',
        color,
        marginBottom: '8px'
      }}>
        {value}
      </div>
      <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        {subtitle}
      </div>
    </div>
  );
}

function CTAButton({ onClick, children, primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: primary ? 'var(--orange)' : 'rgba(255, 255, 255, 0.1)',
        border: primary ? 'none' : '2px solid var(--cyan)',
        color: 'white',
        padding: '14px 32px',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: '700',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 10px 30px ${primary ? 'rgba(255, 140, 66, 0.4)' : 'rgba(0, 217, 255, 0.4)'}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {children}
    </button>
  );
}

function ActivityCard({ activity, onPlayerClick, style }) {
  const player = activity.player;
  const isClickable = isPlayerClickable(player);
  const positions = Array.isArray(player.fields.Position) ? player.fields.Position : [player.fields.Position].filter(Boolean);

  return (
    <div className="card-hover animate-in" style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: '2px solid rgba(123, 63, 242, 0.2)',
      borderRadius: '12px',
      padding: '20px',
      height: '200px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      ...style
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            {isClickable ? (
              <span 
                className="clickable-name"
                onClick={() => onPlayerClick(player)}
                style={{ fontSize: '18px', fontWeight: '700', display: 'block', marginBottom: '8px' }}
              >
                {player.fields['Player Name']}
              </span>
            ) : (
              <span style={{ fontSize: '18px', fontWeight: '700', display: 'block', marginBottom: '8px' }}>
                {player.fields['Player Name']}
              </span>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {positions.map((pos, idx) => (
                <span key={idx} className={`position-badge position-${pos}`}>{pos}</span>
              ))}
            </div>
          </div>
          <span style={{
            background: activity.type === 'commitment' ? 'var(--orange)' : 
                       activity.type === 'transfer' ? 'var(--purple)' : 'var(--cyan)',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px'
          }}>
            {activity.type === 'commitment' ? 'COMMITTED' : 
             activity.type === 'transfer' ? 'TRANSFERRED' : 'ANNOUNCED'}
          </span>
        </div>

        {activity.type === 'commitment' && (
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ color: 'var(--orange)' }}>{activity.school}</strong>
            </div>
            <div>Class of {player.fields['Grad Year']}</div>
          </div>
        )}

        {activity.type === 'transfer' && (
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            <div className="arrow-graphic" style={{ marginBottom: '4px' }}>
              <span>{activity.previousSchool}</span>
              <span style={{ color: 'white', fontWeight: '700' }}>{activity.newSchool}</span>
            </div>
          </div>
        )}

        {activity.type === 'preportal' && (
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: '4px' }}>
              Current: <strong>{activity.currentSchool}</strong>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
        {formatDate(activity.date)}
      </div>
    </div>
  );
}

// ===== COMMITMENTS PAGE =====
function CommitmentsPage({ data, onPlayerClick }) {
  const [activeTab, setActiveTab] = useState('current');
  const [filters, setFilters] = useState({
    gradYear: 'All',
    position: 'All',
    school: 'All',
    dateRange: { start: null, end: null }
  });
  const [showFilters, setShowFilters] = useState(false);

  const filteredCommitments = useMemo(() => {
    return data.commitments.filter(c => {
      const player = getPlayerFromLinkedRecord(c.fields.Player, data.players);
      if (!player) return false;

      // Tab filter
      if (activeTab === 'current' && c.fields.Status !== 'Current Cycle') return false;
      if (activeTab === 'historical' && c.fields.Status === 'Current Cycle') return false;

      // Grad year filter
      if (filters.gradYear !== 'All' && player.fields['Grad Year'] !== parseInt(filters.gradYear)) return false;

      // Position filter (handle multi-select)
      if (filters.position !== 'All') {
        const playerPositions = Array.isArray(player.fields.Position) ? player.fields.Position : [player.fields.Position].filter(Boolean);
        if (!playerPositions.includes(filters.position)) return false;
      }

      // School filter
      if (filters.school !== 'All' && c.fields['Committed School'] !== filters.school) return false;

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.fields['Commitment Date'] || 0);
      const dateB = new Date(b.fields['Commitment Date'] || 0);
      return dateB - dateA;
    });
  }, [data, activeTab, filters]);

  const uniqueSchools = useMemo(() => {
    return [...new Set(data.commitments.map(c => c.fields['Committed School']).filter(Boolean))].sort();
  }, [data]);

  const uniqueGradYears = useMemo(() => {
    return [...new Set(data.players.map(p => p.fields['Grad Year']).filter(Boolean))].sort((a, b) => b - a);
  }, [data]);

  return (
    <div style={{ padding: '40px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '48px',
        marginBottom: '32px',
        letterSpacing: '1px'
      }}>
        <span className="gradient-text">COMMITMENTS</span>
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
        <TabButton active={activeTab === 'current'} onClick={() => setActiveTab('current')}>
          Current Cycle
        </TabButton>
        <TabButton active={activeTab === 'historical'} onClick={() => setActiveTab('historical')}>
          Historical
        </TabButton>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '32px' }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid var(--orange)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            marginBottom: '16px'
          }}
        >
          <Filter size={20} />
          Filters
          <ChevronDown size={16} style={{ transform: showFilters ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }} />
        </button>

        {showFilters && (
          <FilterBar 
            filters={filters}
            setFilters={setFilters}
            schools={uniqueSchools}
            gradYears={uniqueGradYears}
          />
        )}
      </div>

      {/* Results count */}
      <div style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
        Showing {filteredCommitments.length} commitment{filteredCommitments.length !== 1 ? 's' : ''}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '20px'
      }}>
        {filteredCommitments.map((commitment, idx) => (
          <CommitmentCard 
            key={commitment.id}
            commitment={commitment}
            player={getPlayerFromLinkedRecord(commitment.fields.Player, data.players)}
            onPlayerClick={onPlayerClick}
            style={{ animationDelay: `${idx * 0.02}s` }}
          />
        ))}
      </div>

      {filteredCommitments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '18px' }}>No commitments found with current filters.</p>
        </div>
      )}
    </div>
  );
}

function CommitmentCard({ commitment, player, onPlayerClick, style }) {
  if (!player) return null;
  
  const isClickable = isPlayerClickable(player);
  const positions = Array.isArray(player.fields.Position) ? player.fields.Position : [player.fields.Position].filter(Boolean);

  return (
    <div className="card-hover animate-in" style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: '2px solid rgba(255, 140, 66, 0.3)',
      borderRadius: '12px',
      padding: '24px',
      height: '240px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      ...style
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            {isClickable ? (
              <span 
                className="clickable-name"
                onClick={() => onPlayerClick(player)}
                style={{ fontSize: '20px', fontWeight: '700', display: 'block', marginBottom: '8px' }}
              >
                {player.fields['Player Name']}
              </span>
            ) : (
              <span style={{ fontSize: '20px', fontWeight: '700', display: 'block', marginBottom: '8px' }}>
                {player.fields['Player Name']}
              </span>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {positions.map((pos, idx) => (
                <span key={idx} className={`position-badge position-${pos}`}>{pos}</span>
              ))}
            </div>
            {player.fields['Grad Year'] && (
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Class of {player.fields['Grad Year']}
              </div>
            )}
          </div>
          <span style={{
            background: 'var(--orange)',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px'
          }}>
            COMMITTED
          </span>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div className="school-logo">
              {getSchoolInitials(commitment.fields['Committed School'])}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--orange)' }}>
                {commitment.fields['Committed School']}
              </div>
              {player.fields['Club Team'] && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {player.fields['Club Team']}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px' }}>
        {formatDate(commitment.fields['Commitment Date'])}
      </div>
    </div>
  );
}

function FilterBar({ filters, setFilters, schools, gradYears }) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      padding: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px'
    }}>
      <FilterSelect
        label="Grad Year"
        value={filters.gradYear}
        onChange={(value) => setFilters({ ...filters, gradYear: value })}
        options={['All', ...gradYears.map(String)]}
      />
      <FilterSelect
        label="Position"
        value={filters.position}
        onChange={(value) => setFilters({ ...filters, position: value })}
        options={['All', 'GK', 'DEF', 'MID', 'FWD']}
      />
      <FilterSelect
        label="School"
        value={filters.school}
        onChange={(value) => setFilters({ ...filters, school: value })}
        options={['All', ...schools]}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white',
          padding: '10px',
          borderRadius: '6px',
          fontSize: '14px',
          cursor: 'pointer'
        }}
      >
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: 'var(--navy)' }}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: active ? 'var(--cyan)' : 'var(--text-secondary)',
        fontSize: '16px',
        fontWeight: '700',
        padding: '12px 24px',
        cursor: 'pointer',
        borderBottom: active ? '3px solid var(--cyan)' : '3px solid transparent',
        transition: 'all 0.2s ease'
      }}
    >
      {children}
    </button>
  );
}

// ===== TRANSFERS PAGE =====
function TransfersPage({ data, onPlayerClick }) {
  const [activeTab, setActiveTab] = useState('current');
  const [filters, setFilters] = useState({
    position: 'All',
    previousSchool: 'All',
    newSchool: 'All'
  });
  const [showFilters, setShowFilters] = useState(false);

  const filteredTransfers = useMemo(() => {
    return data.transfers.filter(t => {
      const player = getPlayerFromLinkedRecord(t.fields.Player, data.players);
      if (!player) return false;

      // Tab filter
      if (activeTab === 'current' && t.fields.Status !== 'Current Cycle') return false;
      if (activeTab === 'historical' && t.fields.Status === 'Current Cycle') return false;

      // Position filter (handle multi-select)
      if (filters.position !== 'All') {
        const playerPositions = Array.isArray(player.fields.Position) ? player.fields.Position : [player.fields.Position].filter(Boolean);
        if (!playerPositions.includes(filters.position)) return false;
      }

      // School filters
      if (filters.previousSchool !== 'All' && t.fields['Previous School'] !== filters.previousSchool) return false;
      if (filters.newSchool !== 'All' && t.fields['New School'] !== filters.newSchool) return false;

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.fields['Transfer Date'] || 0);
      const dateB = new Date(b.fields['Transfer Date'] || 0);
      return dateB - dateA;
    });
  }, [data, activeTab, filters]);

  const uniquePreviousSchools = useMemo(() => {
    return [...new Set(data.transfers.map(t => t.fields['Previous School']).filter(Boolean))].sort();
  }, [data]);

  const uniqueNewSchools = useMemo(() => {
    return [...new Set(data.transfers.map(t => t.fields['New School']).filter(Boolean))].sort();
  }, [data]);

  return (
    <div style={{ padding: '40px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '48px',
        marginBottom: '32px',
        letterSpacing: '1px'
      }}>
        <span className="gradient-text">TRANSFERS</span>
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
        <TabButton active={activeTab === 'current'} onClick={() => setActiveTab('current')}>
          Current Cycle
        </TabButton>
        <TabButton active={activeTab === 'historical'} onClick={() => setActiveTab('historical')}>
          Historical
        </TabButton>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '32px' }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid var(--purple)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            marginBottom: '16px'
          }}
        >
          <Filter size={20} />
          Filters
          <ChevronDown size={16} style={{ transform: showFilters ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }} />
        </button>

        {showFilters && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <FilterSelect
              label="Position"
              value={filters.position}
              onChange={(value) => setFilters({ ...filters, position: value })}
              options={['All', 'GK', 'DEF', 'MID', 'FWD']}
            />
            <FilterSelect
              label="Previous School"
              value={filters.previousSchool}
              onChange={(value) => setFilters({ ...filters, previousSchool: value })}
              options={['All', ...uniquePreviousSchools]}
            />
            <FilterSelect
              label="New School"
              value={filters.newSchool}
              onChange={(value) => setFilters({ ...filters, newSchool: value })}
              options={['All', ...uniqueNewSchools]}
            />
          </div>
        )}
      </div>

      {/* Results count */}
      <div style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
        Showing {filteredTransfers.length} transfer{filteredTransfers.length !== 1 ? 's' : ''}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {filteredTransfers.map((transfer, idx) => (
          <TransferCard 
            key={transfer.id}
            transfer={transfer}
            player={getPlayerFromLinkedRecord(transfer.fields.Player, data.players)}
            onPlayerClick={onPlayerClick}
            style={{ animationDelay: `${idx * 0.02}s` }}
          />
        ))}
      </div>

      {filteredTransfers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '18px' }}>No transfers found with current filters.</p>
        </div>
      )}
    </div>
  );
}

function TransferCard({ transfer, player, onPlayerClick, style }) {
  if (!player) return null;
  
  const isClickable = isPlayerClickable(player);
  const positions = Array.isArray(player.fields.Position) ? player.fields.Position : [player.fields.Position].filter(Boolean);

  return (
    <div className="card-hover animate-in" style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: '2px solid rgba(123, 63, 242, 0.3)',
      borderRadius: '12px',
      padding: '24px',
      height: '260px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      ...style
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            {isClickable ? (
              <span 
                className="clickable-name"
                onClick={() => onPlayerClick(player)}
                style={{ fontSize: '20px', fontWeight: '700', display: 'block', marginBottom: '8px' }}
              >
                {player.fields['Player Name']}
              </span>
            ) : (
              <span style={{ fontSize: '20px', fontWeight: '700', display: 'block', marginBottom: '8px' }}>
                {player.fields['Player Name']}
              </span>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {positions.map((pos, idx) => (
                <span key={idx} className={`position-badge position-${pos}`}>{pos}</span>
              ))}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Class of {player.fields['Grad Year']}
            </div>
          </div>
          <span style={{
            background: 'var(--purple)',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px'
          }}>
            TRANSFERRED
          </span>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div className="school-logo" style={{ fontSize: '14px' }}>
              {getSchoolInitials(transfer.fields['Previous School'])}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                FROM
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>
                {transfer.fields['Previous School']}
              </div>
            </div>
          </div>

          <div style={{ 
            width: '100%', 
            height: '2px', 
            background: 'linear-gradient(90deg, var(--purple), var(--cyan))',
            margin: '8px 0',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              right: '-4px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '0',
              height: '0',
              borderLeft: '8px solid var(--cyan)',
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent'
            }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="school-logo" style={{ fontSize: '14px' }}>
              {getSchoolInitials(transfer.fields['New School'])}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                TO
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--cyan)' }}>
                {transfer.fields['New School']}
              </div>
            </div>
          </div>
        </div>

        {transfer.fields['Years of Eligibility'] && (
          <div style={{ 
            fontSize: '12px', 
            color: 'var(--text-secondary)',
            background: 'rgba(0, 217, 255, 0.1)',
            padding: '6px 10px',
            borderRadius: '4px',
            display: 'inline-block'
          }}>
            {transfer.fields['Years of Eligibility']} remaining
          </div>
        )}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px' }}>
        {formatDate(transfer.fields['Transfer Date'])}
      </div>
    </div>
  );
}

// ===== PRE-PORTAL PAGE =====
function PrePortalPage({ data, onPlayerClick }) {
  const [filters, setFilters] = useState({
    position: 'All',
    currentSchool: 'All',
    portalWindow: 'All'
  });
  const [showFilters, setShowFilters] = useState(false);

  const filteredPrePortal = useMemo(() => {
    return data.prePortal.filter(p => {
      const player = getPlayerFromLinkedRecord(p.fields.Player, data.players);
      if (!player) return false;

      // Position filter (handle multi-select)
      if (filters.position !== 'All') {
        const playerPositions = Array.isArray(player.fields.Position) ? player.fields.Position : [player.fields.Position].filter(Boolean);
        if (!playerPositions.includes(filters.position)) return false;
      }

      // School filter
      if (filters.currentSchool !== 'All' && p.fields['Current School'] !== filters.currentSchool) return false;

      // Portal window filter
      if (filters.portalWindow !== 'All' && p.fields['Expected Portal Window'] !== filters.portalWindow) return false;

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.fields['Announcement Date'] || 0);
      const dateB = new Date(b.fields['Announcement Date'] || 0);
      return dateB - dateA;
    });
  }, [data, filters]);

  const uniqueSchools = useMemo(() => {
    return [...new Set(data.prePortal.map(p => p.fields['Current School']).filter(Boolean))].sort();
  }, [data]);

  const uniquePortalWindows = useMemo(() => {
    return [...new Set(data.prePortal.map(p => p.fields['Expected Portal Window']).filter(Boolean))].sort();
  }, [data]);

  return (
    <div style={{ padding: '40px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '48px',
        marginBottom: '16px',
        letterSpacing: '1px'
      }}>
        <span className="gradient-text">PORTAL WATCH</span>
      </h1>

      <div style={{
        background: 'rgba(0, 217, 255, 0.1)',
        border: '1px solid rgba(0, 217, 255, 0.3)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '32px',
        fontSize: '14px',
        color: 'var(--text-secondary)'
      }}>
        <strong style={{ color: 'var(--cyan)' }}>Note:</strong> Players who have announced intent to enter the transfer portal before it officially opens. Once the portal opens, coaches can track entries live. This page focuses on pre-announcements and where players land.
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '32px' }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid var(--cyan)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            marginBottom: '16px'
          }}
        >
          <Filter size={20} />
          Filters
          <ChevronDown size={16} style={{ transform: showFilters ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }} />
        </button>

        {showFilters && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <FilterSelect
              label="Position"
              value={filters.position}
              onChange={(value) => setFilters({ ...filters, position: value })}
              options={['All', 'GK', 'DEF', 'MID', 'FWD']}
            />
            <FilterSelect
              label="Current School"
              value={filters.currentSchool}
              onChange={(value) => setFilters({ ...filters, currentSchool: value })}
              options={['All', ...uniqueSchools]}
            />
            <FilterSelect
              label="Expected Portal Window"
              value={filters.portalWindow}
              onChange={(value) => setFilters({ ...filters, portalWindow: value })}
              options={['All', ...uniquePortalWindows]}
            />
          </div>
        )}
      </div>

      {/* Results count */}
      <div style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
        Showing {filteredPrePortal.length} announcement{filteredPrePortal.length !== 1 ? 's' : ''}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '20px'
      }}>
        {filteredPrePortal.map((prePortal, idx) => (
          <PrePortalCard 
            key={prePortal.id}
            prePortal={prePortal}
            player={getPlayerFromLinkedRecord(prePortal.fields.Player, data.players)}
            onPlayerClick={onPlayerClick}
            data={data}
            style={{ animationDelay: `${idx * 0.02}s` }}
          />
        ))}
      </div>

      {filteredPrePortal.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '18px' }}>No pre-portal announcements found with current filters.</p>
        </div>
      )}
    </div>
  );
}

function PrePortalCard({ prePortal, player, onPlayerClick, data, style }) {
  if (!player) return null;
  
  const isClickable = isPlayerClickable(player);
  const positions = Array.isArray(player.fields.Position) ? player.fields.Position : [player.fields.Position].filter(Boolean);
  
  // Check if player has landed (has Transfer Destination linked)
  const transferDestination = prePortal.fields['Transfer Destination'] && prePortal.fields['Transfer Destination'].length > 0
    ? data.transfers.find(t => t.id === prePortal.fields['Transfer Destination'][0])
    : null;

  return (
    <div className="card-hover animate-in" style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: '2px solid rgba(0, 217, 255, 0.3)',
      borderRadius: '12px',
      padding: '24px',
      height: '280px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      ...style
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            {isClickable ? (
              <span 
                className="clickable-name"
                onClick={() => onPlayerClick(player)}
                style={{ fontSize: '20px', fontWeight: '700', display: 'block', marginBottom: '8px' }}
              >
                {player.fields['Player Name']}
              </span>
            ) : (
              <span style={{ fontSize: '20px', fontWeight: '700', display: 'block', marginBottom: '8px' }}>
                {player.fields['Player Name']}
              </span>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {positions.map((pos, idx) => (
                <span key={idx} className={`position-badge position-${pos}`}>{pos}</span>
              ))}
            </div>
          </div>
          <span style={{
            background: transferDestination ? 'var(--cyan)' : 'var(--orange)',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px'
          }}>
            {transferDestination ? 'LANDED' : 'ANNOUNCED'}
          </span>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Current School:
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            {prePortal.fields['Current School']}
          </div>

          {transferDestination ? (
            <div style={{
              background: 'rgba(0, 217, 255, 0.1)',
              border: '1px solid rgba(0, 217, 255, 0.3)',
              borderRadius: '6px',
              padding: '10px',
              fontSize: '14px'
            }}>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Committed to:
              </div>
              <div style={{ color: 'var(--cyan)', fontWeight: '700' }}>
                {transferDestination.fields['New School']}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Expected: {prePortal.fields['Expected Portal Window']}
              </div>
              {prePortal.fields['Years of Eligibility'] && (
                <div style={{ 
                  fontSize: '12px', 
                  color: 'var(--text-secondary)',
                  background: 'rgba(0, 217, 255, 0.1)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  fontWeight: '600'
                }}>
                  {prePortal.fields['Years of Eligibility']} years remaining
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px' }}>
        Announced {formatDate(prePortal.fields['Announcement Date'])}
      </div>
    </div>
  );
}

// ===== RESOURCES PAGE =====
function ResourcesPage() {
  return (
    <div style={{ padding: '40px 24px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '48px',
        marginBottom: '32px',
        letterSpacing: '1px'
      }}>
        <span className="gradient-text">RESOURCES</span>
      </h1>

      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid rgba(123, 63, 242, 0.3)',
        borderRadius: '12px',
        padding: '40px',
        lineHeight: '1.8',
        marginBottom: '32px'
      }}>
        <h2 style={{ fontSize: '24px', marginBottom: '24px', color: 'var(--cyan)' }}>
          Coming Soon
        </h2>
        
        <p style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
          This section will feature comprehensive guides and resources for navigating women's college soccer recruiting, including:
        </p>

        <ul style={{ 
          listStyle: 'none', 
          padding: 0,
          color: 'var(--text-secondary)',
          marginBottom: '32px'
        }}>
          <li style={{ padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            📅 Recruiting Timeline & Key Dates
          </li>
          <li style={{ padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            🔄 Transfer Portal Rules & Process
          </li>
          <li style={{ padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            💰 NIL Basics & Opportunities
          </li>
          <li style={{ padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            📊 Understanding Divisions (D1, D2, D3, NAIA)
          </li>
          <li style={{ padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            📝 Creating Your Recruiting Profile
          </li>
          <li style={{ padding: '12px 0' }}>
            🎯 Reaching Out to Coaches
          </li>
        </ul>

        <div style={{
          background: 'rgba(0, 217, 255, 0.1)',
          border: '1px solid rgba(0, 217, 255, 0.3)',
          borderRadius: '8px',
          padding: '20px',
          fontSize: '14px'
        }}>
          <strong style={{ color: 'var(--cyan)', display: 'block', marginBottom: '8px' }}>
            Our Philosophy:
          </strong>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            WSOC Recruits believes every player deserves a fair shot. We don't rank players — a number can never truly reflect an athlete's potential. And we never charge — recruiting resources should be accessible to all.
          </p>
        </div>
      </div>

      {/* Contact Section */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid rgba(255, 140, 66, 0.3)',
        borderRadius: '12px',
        padding: '40px',
        lineHeight: '1.8'
      }}>
        <h2 style={{ fontSize: '24px', marginBottom: '24px', color: 'var(--orange)' }}>
          Contact Us
        </h2>
        
        <p style={{ marginBottom: '32px', color: 'var(--text-secondary)' }}>
          We're here to help. Reach out for player updates, corrections, or removal requests.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{
            padding: '20px',
            background: 'rgba(0, 217, 255, 0.05)',
            border: '1px solid rgba(0, 217, 255, 0.2)',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              📧 Email
            </div>
            <a href="mailto:wsocrecruits@gmail.com" style={{ 
              color: 'var(--cyan)', 
              fontSize: '18px', 
              fontWeight: '600',
              textDecoration: 'none'
            }}>
              wsocrecruits@gmail.com
            </a>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              For player updates, corrections, or removal requests
            </div>
          </div>

          <div style={{
            padding: '20px',
            background: 'rgba(0, 217, 255, 0.05)',
            border: '1px solid rgba(0, 217, 255, 0.2)',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              X / TWITTER
            </div>
            <a href="https://twitter.com/wsocrecruits" target="_blank" rel="noopener noreferrer" style={{ 
              color: 'var(--cyan)', 
              fontSize: '18px', 
              fontWeight: '600',
              textDecoration: 'none'
            }}>
              @wsocrecruits
            </a>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Follow for real-time updates and announcements
            </div>
          </div>

          <div style={{
            padding: '20px',
            background: 'rgba(255, 140, 66, 0.05)',
            border: '1px solid rgba(255, 140, 66, 0.2)',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <strong style={{ color: 'var(--orange)' }}>Request Removal:</strong>
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              If you'd like your information removed from our database, email us at wsocrecruits@gmail.com with your name and we'll process your request promptly.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== PLAYER MODAL =====
function PlayerModal({ player, data, onClose }) {
  const playerFields = player.fields;
  const positions = Array.isArray(playerFields.Position) ? playerFields.Position : [playerFields.Position].filter(Boolean);
  
  // Find related activities
  const commitment = data.commitments.find(c => 
    c.fields.Player && c.fields.Player.includes(player.id)
  );
  
  const transfer = data.transfers.find(t => 
    t.fields.Player && t.fields.Player.includes(player.id)
  );
  
  const prePortal = data.prePortal.find(p => 
    p.fields.Player && p.fields.Player.includes(player.id)
  );

  const embedUrl = getYouTubeEmbedUrl(playerFields['Highlight URL']);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'linear-gradient(135deg, rgba(123, 63, 242, 0.1), rgba(0, 217, 255, 0.1))',
          backdropFilter: 'blur(20px)',
          border: '2px solid rgba(123, 63, 242, 0.3)',
          borderRadius: '16px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'white',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--purple)';
            e.currentTarget.style.borderColor = 'var(--purple)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
        >
          <X size={24} />
        </button>

        <div style={{ padding: '40px' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '40px',
              marginBottom: '16px',
              letterSpacing: '1px'
            }}>
              {playerFields['Player Name']}
            </h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {positions.map((pos, idx) => (
                <span key={idx} className={`position-badge position-${pos}`} style={{ fontSize: '13px', padding: '6px 14px' }}>
                  {pos}
                </span>
              ))}
            </div>
            <div style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              {commitment && `Class of ${playerFields['Grad Year']}`}
              {!commitment && prePortal && playerFields['Grad Year'] && `Grad Year: ${playerFields['Grad Year']}`}
              {playerFields['Club Team'] && ` • ${playerFields['Club Team']}`}
            </div>
          </div>

          {/* Player Photo */}
          {playerFields['Player Photo URL'] && (
            <div style={{ marginBottom: '32px' }}>
              <img 
                src={playerFields['Player Photo URL']}
                alt={playerFields['Player Name']}
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  border: '2px solid rgba(123, 63, 242, 0.3)'
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Highlight Video */}
          {embedUrl && (
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{
                fontSize: '20px',
                marginBottom: '16px',
                color: 'var(--cyan)',
                fontWeight: '700'
              }}>
                Highlight Reel
              </h3>
              <div className="video-wrapper">
                <iframe
                  src={embedUrl}
                  title="Player Highlight"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          {/* Bio/Notes */}
          {playerFields['Bio/Notes'] && (
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{
                fontSize: '20px',
                marginBottom: '16px',
                color: 'var(--cyan)',
                fontWeight: '700'
              }}>
                About
              </h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                {playerFields['Bio/Notes']}
              </p>
            </div>
          )}

          {/* Contact Section */}
          {(playerFields['X Handle'] || playerFields['Instagram Handle'] || playerFields['Email']) && (
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{
                fontSize: '20px',
                marginBottom: '16px',
                color: 'var(--cyan)',
                fontWeight: '700'
              }}>
                Contact
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {playerFields['X Handle'] && (
                  <a 
                    href={`https://twitter.com/${playerFields['X Handle'].replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid rgba(0, 217, 255, 0.3)',
                      borderRadius: '8px',
                      color: 'var(--cyan)',
                      textDecoration: 'none',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <span style={{ fontWeight: '600' }}>{playerFields['X Handle']}</span>
                    <ExternalLink size={16} style={{ marginLeft: 'auto' }} />
                  </a>
                )}

                {playerFields['Instagram Handle'] && (
                  <a 
                    href={`https://instagram.com/${playerFields['Instagram Handle'].replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'rgba(123, 63, 242, 0.1)',
                      border: '1px solid rgba(123, 63, 242, 0.3)',
                      borderRadius: '8px',
                      color: 'var(--purple)',
                      textDecoration: 'none',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(123, 63, 242, 0.2)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(123, 63, 242, 0.1)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>📷</span>
                    <span style={{ fontWeight: '600' }}>{playerFields['Instagram Handle']}</span>
                    <ExternalLink size={16} style={{ marginLeft: 'auto' }} />
                  </a>
                )}

                {playerFields['Email'] && (
                  <a 
                    href={`mailto:${playerFields['Email']}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'rgba(255, 140, 66, 0.1)',
                      border: '1px solid rgba(255, 140, 66, 0.3)',
                      borderRadius: '8px',
                      color: 'var(--orange)',
                      textDecoration: 'none',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 140, 66, 0.2)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 140, 66, 0.1)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>📧</span>
                    <span style={{ fontWeight: '600' }}>{playerFields['Email']}</span>
                    <ExternalLink size={16} style={{ marginLeft: 'auto' }} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Related Activity */}
          {(commitment || transfer || prePortal) && (
            <div>
              <h3 style={{
                fontSize: '20px',
                marginBottom: '16px',
                color: 'var(--cyan)',
                fontWeight: '700'
              }}>
                Recent Activity
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {commitment && (
                  <div style={{
                    background: 'rgba(255, 140, 66, 0.1)',
                    border: '1px solid rgba(255, 140, 66, 0.3)',
                    borderRadius: '8px',
                    padding: '16px'
                  }}>
                    <div style={{ fontWeight: '700', color: 'var(--orange)', marginBottom: '4px' }}>
                      COMMITTED
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      to <strong style={{ color: 'white' }}>{commitment.fields['Committed School']}</strong>
                      {commitment.fields['Commitment Date'] && ` on ${formatDate(commitment.fields['Commitment Date'])}`}
                    </div>
                  </div>
                )}

                {transfer && (
                  <div style={{
                    background: 'rgba(123, 63, 242, 0.1)',
                    border: '1px solid rgba(123, 63, 242, 0.3)',
                    borderRadius: '8px',
                    padding: '16px'
                  }}>
                    <div style={{ fontWeight: '700', color: 'var(--purple)', marginBottom: '4px' }}>
                      TRANSFERRED
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      from <strong>{transfer.fields['Previous School']}</strong> to <strong style={{ color: 'var(--cyan)' }}>{transfer.fields['New School']}</strong>
                      {transfer.fields['Transfer Date'] && ` on ${formatDate(transfer.fields['Transfer Date'])}`}
                    </div>
                  </div>
                )}

                {prePortal && (
                  <div style={{
                    background: 'rgba(0, 217, 255, 0.1)',
                    border: '1px solid rgba(0, 217, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '16px'
                  }}>
                    <div style={{ fontWeight: '700', color: 'var(--cyan)', marginBottom: '4px' }}>
                      PRE-PORTAL ANNOUNCEMENT
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      Announced intent to enter portal from <strong>{prePortal.fields['Current School']}</strong>
                      {prePortal.fields['Announcement Date'] && ` on ${formatDate(prePortal.fields['Announcement Date'])}`}
                      {prePortal.fields['Expected Portal Window'] && (
                        <div style={{ marginTop: '4px' }}>
                          Expected window: {prePortal.fields['Expected Portal Window']}
                        </div>
                      )}
                      {prePortal.fields['Years of Eligibility'] && (
                        <div style={{ 
                          marginTop: '8px',
                          padding: '6px 10px',
                          background: 'rgba(0, 217, 255, 0.15)',
                          borderRadius: '4px',
                          display: 'inline-block',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {prePortal.fields['Years of Eligibility']} years of eligibility remaining
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== FOOTER =====
function Footer() {
  return (
    <footer style={{
      background: 'rgba(10, 22, 40, 0.95)',
      borderTop: '2px solid rgba(123, 63, 242, 0.3)',
      padding: '40px 24px',
      marginTop: '80px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '24px',
          marginBottom: '16px',
          letterSpacing: '1px'
        }}>
          WSOC<span style={{ color: 'var(--cyan)' }}>RECRUITS</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
          Comprehensive women's college soccer recruiting database
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          © 2022-{new Date().getFullYear()} WSOCRecruits. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ===== LOADING & ERROR STATES =====
function LoadingState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '20px'
    }}>
      <div className="loading-spinner" />
      <p style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>
        Loading player data...
      </p>
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px',
      textAlign: 'center'
    }}>
      <div style={{
        background: 'rgba(255, 140, 66, 0.1)',
        border: '2px solid rgba(255, 140, 66, 0.3)',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '600px'
      }}>
        <h2 style={{ color: 'var(--orange)', marginBottom: '16px', fontSize: '24px' }}>
          Unable to Load Data
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          {error || 'There was an error connecting to the database. Please try again later.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: 'var(--orange)',
            border: 'none',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '700',
            fontSize: '14px'
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
