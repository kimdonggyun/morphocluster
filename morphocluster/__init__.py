"""
Create the MorphoCluster app.
"""

import os

from flask import Flask

from ._version import get_versions
__version__ = get_versions()['version']
del get_versions


def create_app(test_config=None):
    """Create and configure an instance of the Flask application."""

    from flask import (Response, abort, redirect, render_template, request,
                       url_for)

    # Enable fault handler for meaningful stack traces when a worker is killed
    import faulthandler
    faulthandler.enable()

    app = Flask(__name__, instance_relative_config=True)

    # Load config
    app.config.from_object('morphocluster.config_default')

    settings_file = os.environ.get("MORPHOCLUSTER_SETTINGS")
    if settings_file:
        app.config.from_pyfile(os.path.join(app.root_path, settings_file))

    if test_config is not None:
        app.config.update(test_config)

    # Register extensions
    from morphocluster.extensions import database, migrate, redis_lru, rq
    database.init_app(app)
    redis_lru.init_app(app)
    migrate.init_app(app, database)
    rq.init_app(app)

    # Register cli
    from morphocluster import cli
    cli.init_app(app)

    # Custom JSON encoder
    from morphocluster.numpy_json_encoder import NumpyJSONEncoder
    app.json_encoder = NumpyJSONEncoder

    # Enable batch mode
    with app.app_context():
        database.engine.dialect.psycopg2_batch_mode = True

    # apply the blueprints to the app
    from morphocluster.api import api
    from morphocluster.frontend import frontend
    app.register_blueprint(api, url_prefix='/api')
    app.register_blueprint(frontend, url_prefix='/frontend')

    # make url_for('index') == url_for('blog.index')
    # in another app, you might define a separate main index here with
    # app.route, while giving the blog blueprint a url_prefix, but for
    # the tutorial the blog will be the main index
    app.add_url_rule('/', endpoint='index')

    @app.route("/")
    def index():
        return redirect(url_for("frontend.index"))

    @app.route("/labeling")
    def labeling():
        return render_template('pages/labeling.html')

    from flask.helpers import send_from_directory

    @app.route("/get_obj_image/<objid>")
    def get_obj_image(objid):
        with database.engine.connect() as conn:
            stmt = models.objects.select(models.objects.c.object_id == objid)
            result = conn.execute(stmt).first()

        if result is None:
            abort(404)

        response = send_from_directory(app.config["DATASET_PATH"], result["path"],
                                       conditional=True)

        response.headers['Cache-Control'] += ", immutable"

        return response

    # ===============================================================================
    # Authentication
    # ===============================================================================
    from morphocluster import models
    from werkzeug.security import check_password_hash

    def check_auth(username, password):
        # Retrieve entry from the database
        with database.engine.connect() as conn:
            stmt = models.users.select(
                models.users.c.username == username).limit(1)
            user = conn.execute(stmt).first()

            if user is None:
                return False

        return check_password_hash(user["pwhash"], password)

    from time import sleep

    @app.before_request
    def require_auth():
        # exclude 404 errors and static routes
        # uses split to handle blueprint static routes as well
        if not request.endpoint or request.endpoint.rsplit('.', 1)[-1] == 'static':
            return

        auth = request.authorization

        success = check_auth(auth.username, auth.password) if auth else None

        if not auth or not success:
            if success is False:
                # Rate limiting for failed passwords
                sleep(1)

            # Send a 401 response that enables basic auth
            return Response(
                'Could not verify your access level.\n'
                'You have to login with proper credentials', 401,
                {'WWW-Authenticate': 'Basic realm="Login Required"'})

    return app
