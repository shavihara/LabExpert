import React from 'react';

const DeveloperCard = ({ image, name, role, description, borderColor }) => {
  return (
    <div className="developer-card">
      <div className="dev-img-container">
        <img
          src={image}
          alt={name}
          style={{ borderColor: borderColor }}
        />
      </div>
      <div className="dev-info">
        <h3>{name}</h3>
        <p className="dev-role">{role}</p>
        <p className="dev-desc">{description}</p>
      </div>
    </div>
  );
};

export default DeveloperCard;

