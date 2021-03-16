import React from 'react'
import { Nav } from 'react-bootstrap'

export default class AppTest extends React.Component {

  state = {
    pageMenu: ''
  }

  componentDidMount() {
    if(this.props.setSousMenuApplication) {
      console.debug("Setting menu application test")
      this.props.setSousMenuApplication(
        <SousMenu
          page={this.state.page}
          setPageMenu={this.setPageMenu}
          goHome={this.props.goHome} />
      )
    }
  }

  setPageMenu = page => {
    this.setState({pageMenu: page})
  }

  render() {

    console.debug("Render apptest, props\n%O", this.props)

    var pageMenu = ''
    if(this.state.pageMenu) {
      pageMenu = this.state.pageMenu
    }

    return (
      <div>
        <p>Allo le test</p>
        <p>Item du menu : {pageMenu}</p>
      </div>
    )
  }

}

function SousMenu(props) {
  return (
    <Nav className="mr-auto" activeKey={props.page} onSelect={props.setPageMenu}>
      <Nav.Item>
        <Nav.Link eventKey="mama mia">
          Mama mia!
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link onClick={props.goHome}>
          Go Home
        </Nav.Link>
      </Nav.Item>
    </Nav>
  )
}
