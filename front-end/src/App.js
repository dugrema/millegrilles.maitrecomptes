import React from 'react'
import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css'

import {Applications} from './Applications'
import {Authentifier} from './Authentification'

class App extends React.Component {

  state = {
    nomUsagerAuthentifie: '',
  }

  setNomUsagerAuthentifie = nomUsagerAuthentifie => {
    this.setState({nomUsagerAuthentifie})
  }

  render() {

    let affichage;
    if( this.state.nomUsagerAuthentifie === '' ) {
      const searchParams = new URLSearchParams(this.props.location.search)
      const redirectUrl = searchParams.get('url')
      affichage = <Authentifier redirectUrl={redirectUrl} setNomUsagerAuthentifie={this.setNomUsagerAuthentifie}/>
    } else {
      affichage = <Applications nomUsagerAuthentifie={this.state.nomUsagerAuthentifie}/>
    }

    return <LayoutApplication affichage={affichage}/>;
  }
}

// Layout general de l'application
function LayoutApplication(props) {
  return (
    <div className="App">
      <header className="App-header">
        <p>maple</p>
        <p>IDMG : abcd1234</p>
        {props.affichage}
      </header>
    </div>
  )
}

export default App;
