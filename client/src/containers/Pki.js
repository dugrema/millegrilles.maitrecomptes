import React from 'react'
import {Container, Row, Col, Button} from 'react-bootstrap'

export default class Pki extends React.Component {

  render() {
    return (
      <Container>
        <h1>Pki</h1>

        <Row>
          <Col>
            <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
          </Col>
        </Row>

      </Container>
    )
  }

}
