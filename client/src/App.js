import React from 'react'
import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import path from 'path'
import {Container, Row, Col} from 'react-bootstrap'
import axios from 'axios'

import {Applications} from './Applications'
import {Authentifier} from './Authentification'

const MG_URL_API = '/millegrilles/api'
const MG_URL_AUTHENTIFICATION = '/millegrilles/authentification'

class App extends React.Component {

  state = {
    nomUsagerAuthentifie: '',
    idmg: '',
    proprietairePresent: true,
  }

  setNomUsagerAuthentifie = nomUsagerAuthentifie => {
    this.setState({nomUsagerAuthentifie})
  }

  componentDidMount() {
    const urlInfo = path.join('millegrilles', 'info.json')
    axios.get(urlInfo)
    .then(response=>{
      console.debug(response)
      const infoMillegrille = response.data
      this.setState({
        idmg: infoMillegrille.idmg,
        proprietairePresent: infoMillegrille.proprietairePresent,
      })
    })
    .catch(err=>{
      console.error("Erreur acces site")
    })

  }

  render() {

    let affichage;
    if( ! this.state.idmg ) {
      // Chargement initial, affichage page attente
      affichage = <AttenteChargement />
    } else if( this.state.nomUsagerAuthentifie === '' ) {
      const searchParams = new URLSearchParams(this.props.location.search)
      const redirectUrl = searchParams.get('url')
      affichage = <Authentifier
                    redirectUrl={redirectUrl}
                    setNomUsagerAuthentifie={this.setNomUsagerAuthentifie}
                    authUrl={MG_URL_AUTHENTIFICATION}
                    rootProps={this.state} />
    } else {
      affichage = <Applications
                    apiUrl={MG_URL_API}
                    authUrl={MG_URL_AUTHENTIFICATION}
                    nomUsagerAuthentifie={this.state.nomUsagerAuthentifie}
                    rootProps={this.state} />
    }

    return <LayoutApplication affichage={affichage} idmg={this.state.idmg}/>;
  }
}

// Layout general de l'application
function LayoutApplication(props) {
  return (
    <div className="App">
      <header className="App-header">
        <p>maple</p>
        <p>IDMG : {props.idmg}</p>
        {props.affichage}
      </header>
    </div>
  )
}

function AttenteChargement(props) {
  return (
    <Container>
      <Col>
        <Row>
          <p>Attente chargement</p>
        </Row>
      </Col>
    </Container>
  )
}

export default App;
