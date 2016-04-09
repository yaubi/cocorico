var React = require('react');
var ReactIntl = require('react-intl');
var ReactBootstrap = require('react-bootstrap');
var ReactRouter = require('react-router');
var Reflux = require('reflux');
var jquery = require('jquery');
var classNames = require('classnames');

var Button = ReactBootstrap.Button,
    ButtonToolbar = ReactBootstrap.ButtonToolbar,
    Grid = ReactBootstrap.Grid,
    Row = ReactBootstrap.Row,
    Col = ReactBootstrap.Col,
    ProgressBar = ReactBootstrap.ProgressBar,
    Modal = ReactBootstrap.Modal;

var FormattedMessage = ReactIntl.FormattedMessage,
    FormattedTime = ReactIntl.FormattedTime,
    FormattedHTMLMessage = ReactIntl.FormattedHTMLMessage;

var VoteAction = require('../action/VoteAction');

var LoadingIndicator = require('./LoadingIndicator'),
    Hint = require('./Hint'),
    UnvoteButton = require('./UnvoteButton'),
    Countdown = require('./Countdown'),
    Title = require('./Title'),
    Page = require('./Page');

var ConfigStore = require('../store/ConfigStore'),
    BallotStore = require('../store/BallotStore');

var ForceAuthMixin = require('../mixin/ForceAuthMixin');

var VoteWidget = React.createClass({

    mixins: [
        Reflux.connect(ConfigStore, 'config'),
        Reflux.connect(BallotStore, 'ballots'),
        ForceAuthMixin,
        ReactIntl.IntlMixin
    ],

    statics: {
        STEP_CONFIRM:       0,
        STEP_PROOF_OF_VOTE: 1,
        STEP_RECORDING:     2,
        STEP_COMPLETE:      3,
        STEP_ERROR:         4,

        COUNTDOWN:          10
    },

    getInitialState: function()
    {
        return {
            vote: this.props.vote,
            step: 0,
            confirmVoteButtonEnabled: false,
            skipProofOfVoteButtonEnabled: false,
            printedProofOfVote: false
        };
    },

    getDefaultProps: function()
    {
        return {
            onCancel: (e) => {},
            onComplete: (e) => {}
        };
    },

    componentWillReceiveProps: function(nextProps)
    {
        this.setState({
            visible: nextProps.visible,
            vote: this.props.vote
        });
    },

    goToBallotStep: function(ballot)
    {
        if (!!ballot && !ballot.error && ballot.status == 'complete'
            && this.state.step != VoteWidget.STEP_PROOF_OF_VOTE
            && !this._completeTimeout)
            // We wait 1sec to give the progress bar of the pending state
            // enough time to animate to 100%.
            return this._completeTimeout = setTimeout(
                () => this.goToStep(VoteWidget.STEP_COMPLETE),
                1000
            );

        if (!!ballot && !ballot.error && ballot.status == 'pending'
            && this.state.step < VoteWidget.STEP_PROOF_OF_VOTE)
            return this.goToStep(
                !this.state.confirmVoteButtonEnabled
                    ? VoteWidget.STEP_RECORDING
                    : VoteWidget.STEP_PROOF_OF_VOTE
            );
    },

    componentWillMount: function()
    {
        this.checkBallot();
        this._ballotStoreUnsubscribe = BallotStore.listen(
            (store) => this.checkBallot()
        );
    },

    componentDidMount: function()
    {
        this.listenTo(VoteAction.unvote, (billId) => {
            this.goToStep(VoteWidget.STEP_CONFIRM);
        });
    },

    componentWillUnmount: function()
    {
        this.goToStep(VoteWidget.STEP_CONFIRM);

        this._ballotStoreUnsubscribe();

        window.onbeforeunload = null;

        delete this._completeTimeout;

        clearInterval(this._ballotProgressOffsetInterval);
        delete this._ballotProgressOffsetInterval;
    },

    checkBallot: function()
    {
        var ballot = this.state.ballots.getBallotByBillId(this.props.bill.id);

        if (!!ballot && this.state.ballotStatus != ballot.status)
        {
            this.setState({
                ballotStatus: ballot.status,
                ballotProgressOffset: 0.0
            });
        }

        this.goToBallotStep(ballot);
    },

    downloadProofOfVote: function()
    {
        // FIXME: download
        console.log('download');
        this.goToNextStep();
    },

    printProofOfVote: function()
    {
        // FIXME: print
        alert('Pas encore implémenté ! (ceci n\'est pas un bug)');
        this.setState({printedProofOfVote: true});
        this.goToStep(Math.max(VoteWidget.STEP_RECORDING, this.state.step));
    },

    confirmVoteValue: function()
    {
        VoteAction.vote(this.props.bill, this.state.vote);
        // this.goToNextStep();
        this.setState({confirmedVote:true});
    },

    setVoteValue: function(value)
    {
        this.setState({
            vote: value
        });
        this.goToNextStep();
    },

    scrollTop: function()
    {
        jquery('html, body').animate(
            {
                scrollTop: jquery('#vote-widget').offset().top
                    - jquery('#header .navbar').outerHeight()
            },
            500
        );
    },

    goToStep: function(step, doNotScroll)
    {
        if (step != this.state.step)
        {
            this.setState({step: step});

            if (step < 0)
            {
                this.setState({
                    confirmVoteButtonEnabled: false,
                    skipProofOfVoteButtonEnabled: false,
                    printedProofOfVote: false
                });
            }

            // if (!doNotScroll)
            //     this.scrollTop();
        }
    },

    goToPreviousStep: function()
    {
        this.goToStep(this.state.step - 1);
    },

    goToNextStep: function()
    {
        this.goToStep(this.state.step + 1);
    },

    getPendingProgress: function()
    {
        if (this.state.step == VoteWidget.STEP_COMPLETE)
        {
            clearInterval(this._ballotProgressOffsetInterval);
            delete this._ballotProgressOffsetInterval;
            return 1.0;
        }

        if (this.state.step != VoteWidget.STEP_RECORDING)
            return 0.0;

        if (!this._ballotProgressOffsetInterval)
        {
            this._ballotProgressOffsetInterval = setInterval(
                () => this.setState({
                    ballotProgressOffset: this.state.ballotProgressOffset + 0.005
                }),
                1000
            );
        }

        var ballot = this.state.ballots.getBallotByBillId(this.props.bill.id);

        if (ballot.status == 'pending')
            return Math.min(0.33, this.state.ballotProgressOffset);
        if (ballot.status == 'initialized')
            return 0.33 + Math.min(0.33, this.state.ballotProgressOffset);
        if (ballot.status == 'registered')
            return 0.67 + Math.min(0.33, this.state.ballotProgressOffset);

        return 1.0;
    },

    renderProgressBar: function()
    {
        return (
            <div>
                <div className="clearfix">
                    <ProgressBar now={100}
                        style={{borderRight:'1px solid white',borderRadius:0,width:'25%',float:'left'}}
                        className="vote-step-progress"
                        active={this.state.step == VoteWidget.STEP_CONFIRM && this.state.confirmedVote}
                        stripped={this.state.step == VoteWidget.STEP_CONFIRM && this.state.confirmedVote}/>
                    <ProgressBar now={this.state.step >= VoteWidget.STEP_PROOF_OF_VOTE ? 100 : 0}
                        style={{borderRight:'1px solid white',borderRadius:0,width:'25%',float:'left'}}
                        className="vote-step-progress"/>
                    <ProgressBar now={this.getPendingProgress() * 100}
                        style={{borderRight:'1px solid white',borderRadius:0,width:'25%',float:'left'}}
                        className="vote-step-progress"
                        active={this.state.step == VoteWidget.STEP_RECORDING}
                        stripped={this.state.step == VoteWidget.STEP_RECORDING}/>
                    <ProgressBar now={this.state.step >= VoteWidget.STEP_COMPLETE ? 100 : 0}
                        style={{borderRadius:0,width:'25%',float:'left'}}
                        className="vote-step-progress"/>
                </div>
                <Grid>
                    <Row>
                        <Col sm={3}>
                            <div className={classNames({
                                    'vote-step-counter': true,
                                    'vote-step-counter-active': this.state.step == VoteWidget.STEP_CONFIRM,
                                    'vote-step-counter-done': this.state.step > VoteWidget.STEP_CONFIRM,
                                    'hidden-xs': this.state.step != VoteWidget.STEP_CONFIRM
                                })}>
                                <div className="vote-step-number">1</div>
                                <span className="vote-step-name">
                                    {this.getIntlMessage('vote.STEP_1_NAME')}
                                </span>
                            </div>
                        </Col>
                        <Col sm={3}>
                            <div className={classNames({
                                    'vote-step-counter': true,
                                    'vote-step-counter-active': this.state.step == VoteWidget.STEP_PROOF_OF_VOTE,
                                    'vote-step-counter-done': this.state.step > VoteWidget.STEP_PROOF_OF_VOTE,
                                    'hidden-xs': this.state.step != VoteWidget.STEP_PROOF_OF_VOTE
                                })}>
                                <div className="vote-step-number">2</div>
                                    <span className="vote-step-name">
                                        {this.getIntlMessage('vote.STEP_2_NAME')}
                                    </span>
                            </div>
                        </Col>
                        <Col sm={3}>
                            <div className={classNames({
                                    'vote-step-counter': true,
                                    'vote-step-counter-active': this.state.step == VoteWidget.STEP_RECORDING,
                                    'vote-step-counter-done': this.state.step > VoteWidget.STEP_RECORDING,
                                    'hidden-xs': this.state.step != VoteWidget.STEP_RECORDING
                                })}>
                                <div className="vote-step-number">3</div>
                                    <span className="vote-step-name">
                                        {this.getIntlMessage('vote.STEP_3_NAME')}
                                    </span>
                            </div>
                        </Col>
                        <Col sm={3}>
                            <div className={classNames({
                                    'vote-step-counter': true,
                                    'vote-step-counter-active': this.state.step == VoteWidget.STEP_COMPLETE,
                                    'vote-step-counter-done': this.state.step > VoteWidget.STEP_COMPLETE,
                                    'hidden-xs': this.state.step != VoteWidget.STEP_COMPLETE
                                })}>
                                <div className="vote-step-number">4</div>
                                    <span className="vote-step-name">
                                        {this.getIntlMessage('vote.STEP_4_NAME')}
                                    </span>
                            </div>
                        </Col>
                    </Row>
                </Grid>
            </div>
        );
    },

    getVoteValueDisplayMessage: function()
    {
        var voteDisplay = [
            this.getIntlMessage('vote.VOTE_YES'),
            this.getIntlMessage('vote.VOTE_BLANK'),
            this.getIntlMessage('vote.VOTE_NO')
        ];

        return voteDisplay[this.state.vote];
    },

    renderConfirmVoteButton: function()
    {
        return (
            <Button className={classNames({
                    'btn-positive': this.state.vote == 0,
                    'btn-neutral': this.state.vote == 1,
                    'btn-negative': this.state.vote == 2,
                    'btn-vote': true
                })}
                disabled={!this.state.confirmVoteButtonEnabled}
                onClick={(e)=>this.confirmVoteValue()}>
                    <Countdown count={VoteWidget.COUNTDOWN}
                        format={(c) => c == 0
                            ? <FormattedMessage
                                message={this.getIntlMessage('vote.I_CONFIRM_MY_VOTE')
                                    + this.getIntlMessage('vote.VOTE')}
                                value={this.getVoteValueDisplayMessage()}/>
                            : <FormattedMessage
                                message={this.getIntlMessage('vote.I_CONFIRM_MY_VOTE')
                                    + this.getIntlMessage('vote.VOTE') + ' ('
                                    + c + ')'}
                                value={this.getVoteValueDisplayMessage()}/>}
                        onComplete={()=>this.setState({confirmVoteButtonEnabled:true})}/>
            </Button>
        );
    },

    renderConfirmDialog: function()
    {
        return (
            <div>
                <div className="vote-step-description">
                    <p>
                        <FormattedMessage
                            message={this.getIntlMessage('vote.CONFIRM_VOTE_MESSAGE')}
                            value={
                                <strong>
                                    <span className={classNames({
                                            'positive': this.state.vote == 0,
                                            'neutral': this.state.vote == 1,
                                            'negative': this.state.vote == 2
                                        })}>
                                    {this.getVoteValueDisplayMessage()}
                                    </span>
                                </strong>
                            }
                            bill={
                                <strong>
                                    <Title text={this.props.bill.title}/>
                                </strong>
                            }/>
                    </p>
                    <ButtonToolbar>
                        {this.state.confirmedVote
                            ? <LoadingIndicator text="Envoi de votre vote en cours..."/>
                            : <div>
                                {this.renderConfirmVoteButton()}
                                <Button bsStyle="link"
                                    onClick={(e)=>this.props.onCancel(e)}>
                                    {this.getIntlMessage('vote.CANCEL_MY_VOTE')}
                                </Button>
                            </div>}
                    </ButtonToolbar>
                </div>
                <Hint style="warning" pageSlug="attention-impossible-de-revenir-en-arriere"/>
            </div>
        );
    },

    renderProofOfVoteDialog: function()
    {
        window.onbeforeunload = () => this.getIntlMessage('vote.BEFORE_UNLOAD_MESSAGE');

        return (
            <div>
                <div className="vote-step-description">
                    <Page slug="vote-preuve-de-vote"/>
                    <ButtonToolbar>
                        <Button bsStyle="primary"
                            onClick={(e)=>this.printProofOfVote()}>
                            {this.getIntlMessage('vote.PRINT_PROOF_OF_VOTE')}
                        </Button>
                        <Button bsStyle="link"
                            disabled={!this.state.skipProofOfVoteButtonEnabled}
                            onClick={(e)=>this.goToNextStep()}>
                            <Countdown count={VoteWidget.COUNTDOWN}
                                format={(c) => c
                                    ? this.getIntlMessage('vote.IGNORE') + ' ('
                                        + c + ')'
                                    : this.getIntlMessage('vote.IGNORE') + ' ('
                                        + this.getIntlMessage('vote.NOT_RECOMMENDED')
                                        + ')'}
                                onComplete={()=>this.setState({skipProofOfVoteButtonEnabled:true})}/>
                        </Button>
                    </ButtonToolbar>
                </div>
                <Hint style="warning"
                    pageSlug="attention-recuperer-preuve-de-vote-1"/>
            </div>
        );
    },

    renderVotePendingDialog: function()
    {
        if (this.state.skipProofOfVoteButtonEnabled && !this.state.printedProofOfVote)
            window.onbeforeunload = () => this.getIntlMessage('vote.BEFORE_UNLOAD_MESSAGE');
        else
            window.onbeforeunload = null;

        return (
            <div>
                <div className="vote-step-description">
                    <div>
                        {this.getIntlMessage('vote.PLEASE_WAIT_RECORDING_VOTE')}
                    </div>
                </div>
                {this.state.skipProofOfVoteButtonEnabled && !this.state.printedProofOfVote
                    ? <Hint style="warning"
                        actionButtonLabel={this.getIntlMessage('vote.PRINT_PROOF_OF_VOTE')}
                        onActionButtonClick={(e)=>this.printProofOfVote()}
                        pageSlug="attention-recuperer-preuve-de-vote-2"/>
                    : <span/>}
                <Hint pageSlug="astuce-enregistrement-du-vote" disposable={true}/>
            </div>
        );
    },

    renderVoteCompleteDialog: function()
    {
        if (this.state.skipProofOfVoteButtonEnabled && !this.state.printedProofOfVote)
            window.onbeforeunload = () => this.getIntlMessage('vote.BEFORE_UNLOAD_MESSAGE');
        else
            window.onbeforeunload = null;

        return (
            <div>
                <div className="vote-step-description">
                    <p>
                        <FormattedMessage
                            message={this.getIntlMessage('vote.YOUR_VOTE_IS_COMPLETE')}
                            value={
                                <strong>
                                    <span className={classNames({
                                            'positive': this.state.vote == 0,
                                            'neutral': this.state.vote == 1,
                                            'negative': this.state.vote == 2
                                        })}>
                                        {this.getVoteValueDisplayMessage()}
                                    </span>
                                </strong>
                            }
                            bill={
                                <strong>
                                    <Title text={this.props.bill.title}/>
                                </strong>
                            }/>
                    </p>
                </div>
                {this.state.skipProofOfVoteButtonEnabled && !this.state.printedProofOfVote
                    ? <Hint style="warning"
                        actionButtonLabel={this.getIntlMessage('vote.PRINT_PROOF_OF_VOTE')}
                        onActionButtonClick={(e)=>this.printProofOfVote()}
                        pageSlug="attention-recuperer-preuve-de-vote-3"/>
                    : <span/>}
            </div>
        );
    },

    complete: function(e)
    {
        window.onbeforeunload = null;
        // this.goToStep(VoteWidget.STEP_INIT);
        // this.setState({voteModalClosed:true});
        this.props.onComplete(e);
    },

    getStepTitle: function()
    {
        var stepTitles = [
            this.getIntlMessage('vote.STEP_1_TITLE'),
            this.getIntlMessage('vote.STEP_2_TITLE'),
            this.getIntlMessage('vote.STEP_3_TITLE'),
            this.getIntlMessage('vote.STEP_4_TITLE')
        ];

        return (
            <FormattedMessage message={this.getIntlMessage('vote.STEP_TITLE')}
                step={this.state.step + 1}
                total="4"
                title={stepTitles[this.state.step]}/>
        );
    },

    renderModalFooter: function()
    {
        return (
            <Modal.Footer>
                {this.state.step == VoteWidget.STEP_COMPLETE
                    ? <Button onClick={(e)=>this.complete(e)}
                        disabled={!this.state.printedProofOfVote && this.state.confirmedVote && !this.state.exitButtonEnabled}>
                        {this.state.printedProofOfVote || !this.state.confirmedVote
                            ? this.getIntlMessage('vote.EXIT')
                            : <Countdown count={VoteWidget.COUNTDOWN}
                                format={(c) => c != 0
                                    ? this.getIntlMessage('vote.EXIT_WITHOUT_PROOF_OF_VOTE') + ' (' + c + ')'
                                    : this.getIntlMessage('vote.EXIT_WITHOUT_PROOF_OF_VOTE')}
                                onComplete={()=>this.setState({exitButtonEnabled:true})}/>}
                    </Button>
                    : this.state.step >= VoteWidget.STEP_PROOF_OF_VOTE
                        ? <span className="pull-left">
                            <LoadingIndicator text={
                                <FormattedMessage
                                    message={this.getIntlMessage('vote.YOUR_VOTE_IS_BEING_RECORDED')}
                                    value={
                                        <strong>
                                            <span className={classNames({
                                                    'positive': this.state.vote == 0,
                                                    'neutral': this.state.vote == 1,
                                                    'negative': this.state.vote == 2
                                                })}>
                                            {this.getVoteValueDisplayMessage()}
                                            </span>
                                        </strong>
                                    }
                                    bill={
                                        <strong>
                                            <Title text={this.props.bill.title}/>
                                        </strong>
                                    }/>
                                }/>
                        </span>
                        : <span/>}
            </Modal.Footer>
        );
    },

    render: function()
    {
        var showModalFooter = this.state.step == VoteWidget.STEP_COMPLETE
            || this.state.step >= VoteWidget.STEP_PROOF_OF_VOTE;

        return (
            <Modal bsSize="large" show={true} dialogClassName="vote-widget">
                <Modal.Header>
                    <Modal.Title>
                        {this.getStepTitle()}
                    </Modal.Title>
                </Modal.Header>
                {this.renderProgressBar()}
                <Modal.Body>
                    {this.state.step == VoteWidget.STEP_CONFIRM
                        ? this.renderConfirmDialog()
                        : <span/>}
                    {this.state.step == VoteWidget.STEP_PROOF_OF_VOTE
                        ? this.renderProofOfVoteDialog()
                        : <span/>}
                    {this.state.step == VoteWidget.STEP_RECORDING
                        ? this.renderVotePendingDialog()
                        : <span/>}
                    {this.state.step == VoteWidget.STEP_COMPLETE
                        ? this.renderVoteCompleteDialog()
                        : <span/>}
                </Modal.Body>
                {showModalFooter
                    ? this.renderModalFooter()
                    : <span/>}
            </Modal>
        );
    }
});

module.exports = VoteWidget;