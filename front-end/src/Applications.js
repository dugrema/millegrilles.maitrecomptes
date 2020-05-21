import React from 'react'
import './App.css'
import {Button, Form, Container, Row, Col} from 'react-bootstrap'
import axios from 'axios'

export class Applications extends React.Component {

  render() {
    return (
      <Container>
        <p>Authentifie en tant que {this.props.nomUsagerAuthentifie}, liste apps</p>
        <Button href="/authentification/fermer">Fermer</Button>
      </Container>
    )
  }
}
