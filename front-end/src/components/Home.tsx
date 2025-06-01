import React from "react";
import './Home.css'

const Home: React.FC = () => {
  return (
    <div>
      <h1 className="text-5xl">Welcome to LabExpert</h1>
      <p>
        This is the home page of your laboratory management system. 
        Use the navigation to explore features and manage your lab efficiently.
      </p>
    </div>
  );
};

export default Home;