import { useParams, useNavigate } from 'react-router-dom';
import ExperimentInterface from './pages/ExperimentInterface/ExperimentInterface';
import NewExperimentInterface from './pages/ExperimentInterface/ExperimentInterface.jsx';
import OSIInterface from './components/OSIInterface';

function ExperimentRouter() {
  const { id } = useParams(); // Gets the ID from the URL
  const navigate = useNavigate();

  // Function to go back to home page
  const goBack = () => {
    navigate('/home');
  };

  // Load different components based on experiment ID
  switch(id) {
    case '1':
      return <ExperimentInterface experimentId={'1'} goBack={goBack} />;

    case '2':
      return <OSIInterface goBack={goBack} />;

    case '5':
      return <ExperimentInterface experimentId={'5'} goBack={goBack} />;

    case '4':
      console.log('Rendering NewExperimentInterface for ID 4');
      return <NewExperimentInterface experimentId={'4'} goBack={goBack} />;

    default:
      // If ID doesn't match any experiment
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h1>Experiment Not Found</h1>
          <p>The experiment you're looking for doesn't exist.</p>
          <button onClick={goBack}>Back to Home</button>
        </div>
      );
  }
}

export default ExperimentRouter;
