import React from 'react'
import { Form, InputGroup, Row, Col, Button } from 'react-bootstrap'

export class ActionsFederees extends React.Component {



  render() {
    return (
      <div>
        <Row>
          <Col>
            <h2>Actions federees</h2>
          </Col>
        </Row>

        <OuvertureFederee />

        <Button onClick={this.props.revenir} variant="secondary">Retour</Button>

      </div>
    )
  }

}

class OuvertureFederee extends React.Component {
  state = {
    url: '',
  }

  changerUrl = event => {
    const url = event.currentTarget.value
    this.setState({url})
  }

  render() {
    return (
      <Form>
        <Form.Group controlId="formUrl" method="post" action="DUMMY">
          <InputGroup>
            <InputGroup.Prepend><InputGroup.Text>URL</InputGroup.Text></InputGroup.Prepend>
            <Form.Control
              type="text"
              placeholder="https://www.millegrilles.com"
              value={this.state.url}
              onChange={this.changerUrl} />
            <InputGroup.Append>
              <Button type="submit" variant="dark">GO</Button>
            </InputGroup.Append>
          </InputGroup>
          <Form.Text className="text-muted">
              Entrez l'adresse du site web de la MilleGrille ou vous voulez vous connecter
          </Form.Text>
        </Form.Group>
      </Form>
    )
  }
}
