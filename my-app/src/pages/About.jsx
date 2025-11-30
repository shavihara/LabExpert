import React from 'react';
import { 
  Cpu, 
  Server, 
  Monitor, 
  Users, 
  Activity, 
  Zap, 
  Globe, 
  Shield, 
  Code, 
  Database, 
  Wifi,
  Layers
} from 'lucide-react';
import DeveloperCard from '../components/common/DeveloperCard';
import dev1Image from '../assets/Developers/dev1.jpg';
import dev2Image from '../assets/Developers/dev2.jpg';
import dev3Image from '../assets/Developers/dev3.jpg';
import dev4Image from '../assets/Developers/dev4.jpg';
import '../styles/About.css';

const About = () => {
  const developers = [
    {
      id: 1,
      name: 'T.H.N.S.Shavihara',
      role: 'Full Stack Developer',
      description: 'Specializes in React frontend development and system integration',
      image: dev1Image,
      borderColor: '#8b5cf6' // Violet-500
    },
    {
      id: 2,
      name: 'D.M.T.Rananimala',
      role: 'Backend Engineer',
      description: 'Expert in Python backend services and WebSocket architecture',
      image: dev2Image,
      borderColor: '#10b981' // Emerald-500
    },
    {
      id: 3,
      name: 'R.A.T.Ranawaka',
      role: 'Embedded Systems Engineer',
      description: 'Specializes in ESP32 firmware development and sensor integration',
      image: dev3Image,
      borderColor: '#f43f5e' // Rose-500
    },
    {
      id: 4,
      name: 'Sudesh Bandara',
      role: 'DevOps & System Architecture',
      description: 'Focuses on system deployment and infrastructure management',
      image: dev4Image,
      borderColor: '#f59e0b' // Amber-500
    }
  ];

  return (
    <div className="about-page">
      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="pulse-dot"></span>
            v1.2 Stable Release
          </div>
          <h1>
            Revolutionizing <span className="gradient-text">Physics Education</span>
          </h1>
          <p className="hero-subtitle">
            An IoT-based laboratory platform enabling remote experimentation with real-time data analysis.
          </p>
        </div>
        <div className="hero-background">
          <div className="glow-sphere sphere-1"></div>
          <div className="glow-sphere sphere-2"></div>
        </div>
      </div>

      <div className="about-container">
        {/* Overview Section */}
        <section className="overview-section fade-in-up">
          <div className="section-header">
            <Globe className="section-icon" />
            <h2>Our Mission</h2>
          </div>
          <div className="overview-card">
            <p>
              LabExpert democratizes access to quality physics laboratory experiences. By bridging the gap between physical phenomena and digital analysis, we provide an affordable, scalable, and user-friendly platform for students, educators, and researchers worldwide.
            </p>
          </div>
        </section>

        {/* Architecture Section */}
        <section className="architecture-section fade-in-up delay-1">
          <div className="section-header">
            <Layers className="section-icon" />
            <h2>Technical Architecture</h2>
          </div>
          <div className="architecture-grid">
            {/* ESP32 Layer */}
            <div className="tech-card">
              <div className="card-icon-wrapper esp-color">
                <Cpu className="card-icon" />
              </div>
              <h3>ESP32 Sensor Layer</h3>
              <ul className="tech-list">
                <li><Activity size={16} /> TOF & Oscillation Sensors</li>
                <li><Zap size={16} /> Real-time Data Streaming</li>
                <li><Wifi size={16} /> Dual-partition OTA Updates</li>
                <li><Shield size={16} /> Auto-discovery Protocol</li>
              </ul>
            </div>

            {/* Backend Layer */}
            <div className="tech-card">
              <div className="card-icon-wrapper python-color">
                <Server className="card-icon" />
              </div>
              <h3>Python Backend</h3>
              <ul className="tech-list">
                <li><Code size={16} /> FastAPI Framework</li>
                <li><Zap size={16} /> WebSocket Managers</li>
                <li><Database size={16} /> SQLite & Session Mgmt</li>
                <li><Cpu size={16} /> Modular Processing Engines</li>
              </ul>
            </div>

            {/* Frontend Layer */}
            <div className="tech-card">
              <div className="card-icon-wrapper react-color">
                <Monitor className="card-icon" />
              </div>
              <h3>React Frontend</h3>
              <ul className="tech-list">
                <li><Activity size={16} /> Plotly.js Visualization</li>
                <li><Layers size={16} /> Tailwind CSS & Responsive</li>
                <li><Globe size={16} /> Progressive Web App</li>
                <li><Users size={16} /> Multi-user Interface</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="features-section fade-in-up delay-2">
          <div className="section-header">
            <Zap className="section-icon" />
            <h2>Key Capabilities</h2>
          </div>
          <div className="features-grid">
            <div className="feature-item">
              <Activity className="feature-icon" />
              <h4>Real-time Collection</h4>
              <p>Millisecond-precision streaming</p>
            </div>
            <div className="feature-item">
              <Users className="feature-icon" />
              <h4>Multi-user Support</h4>
              <p>Concurrent experiment sessions</p>
            </div>
            <div className="feature-item">
              <Monitor className="feature-icon" />
              <h4>Advanced Analytics</h4>
              <p>Automated physics calculations</p>
            </div>
            <div className="feature-item">
              <Globe className="feature-icon" />
              <h4>Remote Access</h4>
              <p>Control labs from anywhere</p>
            </div>
          </div>
        </section>

        {/* Team Section */}
        <section className="team-section fade-in-up delay-3">
          <div className="section-header">
            <Users className="section-icon" />
            <h2>Meet the Team</h2>
          </div>
          <div className="developers-grid">
            {developers.map((developer) => (
              <DeveloperCard
                key={developer.id}
                image={developer.image}
                name={developer.name}
                role={developer.role}
                description={developer.description}
                borderColor={developer.borderColor}
              />
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="about-footer-modern fade-in-up delay-4">
          <p className="footer-tagline">Making Physics Education Accessible</p>
          <p className="footer-copy">© 2024 LabExpert Development Team</p>
        </div>
      </div>
    </div>
  );
};

export default About;
