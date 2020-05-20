import React from 'react';
import './App.css';
import {Button} from 'react-bootstrap';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <p>MilleGrilles</p>
        <p>IDMG : abcd1234</p>
        <Authentifier />
      </header>
    </div>
  );
}

class Authentifier extends React.Component {

  boutonAuthentifier(event) {
    console.debug("Authentifier")
  }

  render() {
    return (
      <Button onClick={this.boutonAuthentifier}>Authentifier</Button>
    )

  }
}

export default App;
