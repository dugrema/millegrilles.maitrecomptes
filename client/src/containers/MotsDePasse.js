import React from 'react'
import {Button, Form, Row, Col} from 'react-bootstrap'

export class MotsDePasse extends React.Component {

  state = {
    name: '',
    password: '',
    motdepasse1: '',
    motdepasse2: '',
  }

  onChange = event => {
    const {name, value} = event.currentTarget
    this.setState({[name]: value})
  }

  soumettre = event => {
    event.preventDefault()
    event.stopPropagation()
    const form = event.currentTarget

    form.submit()
    // this.props.revenir()
  }

  render() {
    return (
      <div>
        <p>Mot de passe</p>

        <Form onSubmit={this.soumettre} method="post" action="/millegrilles">
          <Form.Group as={Row} controlId="name">
            <Form.Label column sm={2}>
              User
            </Form.Label>
            <Col sm={10}>
              <Form.Control type="text" autoCorrect="false" autoComplete="username" name="name" onChange={this.onChange} />
            </Col>
          </Form.Group>
          <Form.Group as={Row} controlId="motdepasse1">
            <Form.Label column sm={2}>
              Mot de passe 1
            </Form.Label>
            <Col sm={10}>
              <Form.Control type="password" autoCorrect="false" autoComplete="current-password" name="password" onChange={this.onChange} />
            </Col>
          </Form.Group>

          <Button type="submit">Soumettre</Button>
          <Button onClick={this.props.revenir} variant="secondary">Revenir</Button>

        </Form>

      </div>
    )
  }

}
