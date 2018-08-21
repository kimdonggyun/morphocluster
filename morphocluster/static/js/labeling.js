function init_tree() {
	// Templates
	var node_preview_template = $.templates("#node-preview-template");
	var obj_preview_template = $.templates("#obj-preview-template");
	var node_template = $.templates("#node-template");
	var $nodeStatus = $("#node-status");
	var $treeStatus = $("#tree-status");
	var $nodePane = $('#node-pane');
	var $recommendPane = $("#recommend-pane");
	var $recommendStatus = $("#recommend-status");
	
	var appState = {
			node: undefined,
			display: "children"
	};
	
	var nodePaneScrollHandler, recommendPaneScrollHandler;
	var recommendJumpToPage, recommendNextPage;
	
	var flashMsg = new function FlashMsg() {
		this.msg = "";
		this.get = function () {
			var msg = this.msg;
			this.msg = "";
			return msg;
		}
		this.set = function (msg) {
			this.msg = msg;
		}
	};
	
	/**
	 * Generate a hash query string
	 */
	function unparseHash(node_id, state) {
		var params = new URLSearchParams({
			node_id: node_id,
			display: state["display"] || "children",
			
		});
		return '#' + params.toString();
	}
	
	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * AJAX methods
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	function patchNode(node_id, data) {
		return $.ajax({
			type: "PATCH",
			url: "/api/nodes/" + node_id,
			data: JSON.stringify(data),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
		});
	}
	
	/**
	 * Load new node.
	 * @trigger load_node.morphocluster
	 */
	function loadNode(node_id, state, cause) {
		state = state || { display: "children" };
		
		$nodeStatus.text("Loading node " + node_id + "...");
		$.get("/api/nodes/" + node_id).done(function (node) {
			appState.node = node;
			$.extend(appState, state);
			
			if(cause != "hash") {
				// Update hash to reflect the current state
				history.pushState({}, '', unparseHash(node_id, appState));
			}
			
			$(document).trigger("load_node.morphocluster", {"cause": cause});
		}).fail(function (jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			$nodeStatus.text("Failed to load node " + node_id + ": ", textStatus + ", " + errorThrown);
		});
	}
	
	// Debug
	$(document).on("load_node.morphocluster", function (event, data) {
		console.log("load_node.morphocluster", event, data);
	});
	
	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Tree
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	var treeView = $.jstree.create("#tree-pane", {
		'core' : {
			'data' : {
				'url' : function(node) {
					if(node.id === "#") {
						return "/api/tree";
					}
					return "/api/tree/" + node.id;
				}
			}
		}
	});
	
	/**
	 * Load a whole path.
	 * Existing nodes are not reloaded except for the last two (current node and parent).
	 */
	function load_path(path, done) {
		if (path.length == 0) {
			done();
			return;
		}
		
		var node = $('#tree-pane').jstree("get_node", path[0]);
		
		if (node == false || !node.state.loaded || path.length <= 2) {
			// If the node is not in the tree, load it and recurse
			$('#tree-pane').jstree("load_node", path[0], function (node, status) {
				load_path(path.slice(1), done);
			});
		} else {
			load_path(path.slice(1), done);
		}
	}
	
	// When the state changes, update the tree accordingly
	$(document).on("load_node.morphocluster", function (event, data) {
		/*if (data.cause == "tree") {
			// Ignore events that where generated by the tree itself
			return;
		}*/
		
		// Load the full path to the current node
		if(appState.node && appState.node.path) {
			console.log("Loading path for", appState.node.node_id);
			$treeStatus.text("Loading path for " + appState.node.node_id + "...");
			load_path(appState.node.path, function () {
				// Highlight and scroll to current node
				// TODO: Check if correct node is already selected
				treeView.deselect_all();
				treeView.select_node(appState.node.node_id, true);
				treeView.open_node(appState.node.node_id);
				treeView.get_node(appState.node.node_id, true)[0].scrollIntoViewIfNeeded(false);
				$treeStatus.empty();
			});
		}
	});
	
	// Change application state when a node is activated
	$('#tree-pane').on("activate_node.jstree", function(event, data) {
		console.log("activate_node.jstree", event, data);
		loadNode(data.node.id, null, "tree");
	});
	
	// Open hash when tree is loaded
	$('#tree-pane').on("loaded.jstree", function (event) {
		openHash();
	});
	
	
	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Hash
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	function openHash() {
		// Parse fragment of the location
		var params = new URLSearchParams(location.hash.replace('#', ''));
		
		var node_id = parseInt(params.get("node_id"));
		params.delete("node_id");
		
		var state = {};
		for(var k of params.keys()) { 
			state[k] = params.get(k);
		}
		
		if (!isNaN(node_id)) {
			loadNode(node_id, state, "hash");
		} else {
			console.log("Could not parse hash:", location.hash.replace('#', ''));
		}
	}
	
	/*
	 * If the hash is changed by user input or history change or when the tree is loaded,
	 * apply this to application state
	 */
	$(window).on("popstate hashchange loaded.jstree", function (event) {
		console.log("Loaded");
		openHash();
	});
	
	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Node pane
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	// When the state changes, update the node pane accordingly
	// @trigger node_loaded.morphocluster
	$(document).on("load_node.morphocluster", function (event, data) {
		var node = appState.node;
		
		$nodeStatus.text("Opening " + node.id + "...");
		
		var $node_pane = $("#node-pane").empty();
			
		node.n_objects_deep_txt = Number.prototype.toLocaleString.apply(node.n_objects_deep, ["en-US"])
		$node_pane.append(node_template.render(node));
		
		$("#node-starred").prop("checked", node.starred);
		
		if(node.n_children == 0) {
			appState.display = "objects";
			
		}
		
		$(document).trigger("node_loaded.morphocluster");
		
		var displayObjects = appState.display == "objects";
		
		var parameters = {
				objects: displayObjects,
				nodes: !displayObjects,
				arrange_by: node.n_children == 0 ? "interleaved" : "starred_sim",
				// Always show starred objects first
				starred_first: true
		};
		
		var $row = $('<div class="row"/>').appendTo($node_pane);
		
		if(node.n_children > 0 || appState.display == "children") {
			$('<div class="col col-2" />').append(render_obj_child_spaceholder()).appendTo($row);
		}
		
		var $loading = $('<div class="col col-2"/>').text("Loading...").appendTo($row);
		var members_loading = false;
		var next_url = "";
		
		var processResponse = function (response, textStatus, jqXHR) {
			var data = response.data;
			$loading.detach();
			$.each(data, function (k, member) {
				$row.append($('<div class="col col-2" />').append(render_member(member, ["moveup", "expand"])));
			});
			
			// See if there is more data
			var links = parseLinkHeader(jqXHR.getResponseHeader("Link"));
			if ("next" in links) {
				next_url = links["next"];
				$loading.appendTo($row);
			} else {
				next_url = "";
			}
			
			$nodeStatus.text(flashMsg.get());
			members_loading = false;
		};
		
		members_loading = true;
		$.get("/api/nodes/" + node.id + '/members', parameters).done(processResponse).fail(function (jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			$nodeStatus.text(textStatus + ", " + errorThrown);
		});
		
		nodePaneScrollHandler = function () {
			var scrollBottom = $nodePane.prop('scrollHeight') - $nodePane.height() - $nodePane.scrollTop();
			if(scrollBottom > 100) {
				return;
			}
			
			
			if(!members_loading && next_url.length) {
				members_loading = true;
				$nodeStatus.text("Loading more...");
				console.log("Loading", next_url);
				$.get(next_url).done(processResponse).fail(function (jqXHR, textStatus, errorThrown) {
					console.log(jqXHR, textStatus, errorThrown);
					$nodeStatus.text(textStatus + ", " + errorThrown);
				});
			}
		};
	});
	
	$nodePane.on("scroll", function () {
		if(typeof(nodePaneScrollHandler) == "function") {
			nodePaneScrollHandler();
		}
	});
	
	
	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Recommend pane
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	// Reload recommendations when the node is loaded
	$(document).on("node_loaded.morphocluster", function (event, data) {
		console.log(event, data);
	});
	
	/*
	 * AJAX methods
	 */
	function node_merge_into(node_id, dest_node_id) {
		console.log("Merging", node_id, "into", dest_node_id);
		$nodeStatus.text("Merging " + node_id + " into " + dest_node_id + "...");
		
		return $.ajax({
			type: "POST",
			url: "/api/nodes/" + node_id + "/merge_into",
			data: JSON.stringify({dest_node_id: dest_node_id}),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
		});
	}
	
	function node_adopt_members(parent_node_id, members) {
		if(!Array.isArray(members)) {
			members = [members];
		}
		
		console.log(parent_node_id, "adopts", members);
		
		return $.ajax({
			type: "POST",
			url: "/api/nodes/" + parent_node_id + "/adopt_members",
			data: JSON.stringify({members: members}),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
		});
	}
	
	function getSelectedNodeIds() {
		return $.map($('#node-pane .node.selected'), n => $(n).data("node_id"));
	}
	
	$('#node-pane').on("submit", "#node-userdata", function(event) {
		var node = appState.node;
		$nodeStatus.text("Saving " + node.node_id + "...");
		
		var data = {};
		
	    jQuery.each( $( this ).serializeArray(), function( i, field ) {
	    	data[field.name] = field.value;
	    });
		
		$.ajax({
			type: "PATCH",
			url: "/api/nodes/" + node.node_id,
			data: JSON.stringify(data),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
		}).done(function (data) {
			console.log("Saved node:", data);
			flashMsg.set("Saved " + node.node_id + ".");
			loadNode(node.node_id, appState);
		}).fail(function (jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			$nodeStatus.text(textStatus + ", " + errorThrown);
		});
		
		return false;
	});
	
	/**
	 * Display the recommendations this node.
	 */
	function display_recommendations(node_id, cause, callback) {
		$recommendStatus.text("Loading recommendations for " + node_id + "...");
		
		var node = appState.node;
		
		$recommendPane.empty();
		recommendJumpToPage = recommendNextPage = 0;
		
		/*$recommendPane.html("<h1>Recommended children for " + node_id + "</h1>");
		$recommendPane.append('<p>' + response.length + ' recommendations.</p>');*/
		
		var $row = $('<div class="row"/>').appendTo($recommendPane);
		
		var $loading = $('<div class="col col-2"/>').text("Loading...").appendTo($row);
		
		var members_loading = false;
		var next_url = "";
		
		var processResponse = function (response, textStatus, jqXHR) {
			var data = response.data;
			$loading.detach();
			$.each(data, function (k, member) {
				$row.append($('<div class="col col-6" />').append(render_member(member, ["uptohere"])));
			});
			
			// See if there is more data
			var links = parseLinkHeader(jqXHR.getResponseHeader("Link"));
			if ("next" in links) {
				next_url = links["next"];
				recommendNextPage = parseInt((new URLSearchParams(next_url.split("?")[1])).get("page"));
				$loading.appendTo($row);
			} else {
				next_url = "";
				recommendJumpToPage = recommendNextPage = 0;
			}
			
			$recommendStatus.empty();
			members_loading = false;
			$(document).trigger("recommend_do_scroll.morphocluster");
		};
		
		if (appState.display == "children") {
			console.log("Recommending children.");
			
			members_loading = true;
			$.get("/api/nodes/" + node_id + '/recommended_children', {max_n: 1000}).done(processResponse).fail(
					function (jqXHR, textStatus, errorThrown) {
						console.log(jqXHR, textStatus, errorThrown);
						$recommendStatus.text(textStatus + ", " + errorThrown);
					});
		} else {
			console.log("Recommending objects.");
			
			members_loading = true;
			$.get("/api/nodes/" + node_id + '/recommended_objects', {max_n: 10000}).done(processResponse).fail(
					function (jqXHR, textStatus, errorThrown) {
						console.log(jqXHR, textStatus, errorThrown);
						$recommendStatus.text(textStatus + ", " + errorThrown);
					});
		}
		
		recommendPaneScrollHandler = function () {
			var scrollBottom = $recommendPane.prop('scrollHeight') - $recommendPane.height() - $recommendPane.scrollTop();
			if(scrollBottom > 100) {
				return;
			}
			
			
			if(!members_loading && next_url.length) {
				members_loading = true;
				$recommendStatus.text("Loading more...");
				console.log("Loading", next_url);
				$.get(next_url).done(processResponse).fail(function (jqXHR, textStatus, errorThrown) {
					console.log(jqXHR, textStatus, errorThrown);
					$recommendStatus.text(textStatus + ", " + errorThrown);
				});
			}
		};
	}
	
	$recommendPane.on("scroll", function () {
		if(typeof(recommendPaneScrollHandler) == "function") {
			recommendPaneScrollHandler();
		}
	});
	
	$(document).on("recommend_do_scroll.morphocluster", function () {
		if(recommendJumpToPage >= recommendNextPage) {
			$recommendPane.scrollTop($recommendPane.prop('scrollHeight'));
			setTimeout(function () {
				$(document).trigger("recommend_do_scroll.morphocluster");
			}, 500);
		}
	});
	
	
	$("#node-pane,#recommend-pane").tooltip({
		items: "img.show-tt-fullsize",
		content: function() {
			$this = $(this);
			return '<img src="' + $this.attr("src") + '" class="tt-fullsize" />';
		},
		show: {
			delay: 1000
		}
	});
	
	/* * * * * *
	 * Helpers *
	 * * * * * */
	
	function getSelectedObjids(parent) {
		return $.map(parent.find('.member.selected'), n => $(n).data("object_id"));
	}
	
	/*function gen_node_preview(node) {
		var $node = $(node_preview_template.render(node));
		
		$node.data("node_id", node.id);
		
		var $node_images = $node.children(".images");
		
		$.each(node.preview, function (k, v) {
			$node_images.append('<img src="/get_obj_image/' + v + '" class="show-tt-fullsize" />');
		});
		
		return $node;
	}
	
	function gen_obj_preview(object_id) {
		var $obj = $(obj_preview_template.render({objid: objid}));
		
		$obj.data("objid", objid);
		
		return $obj;
	}*/
	
	var memberControls = {
			"moveup": {
				icon: "mdi-arrow-up",
				title: "Move this member to the parent node."
			},
			"delete": {
				icon: "mdi-delete-forever",
				title: "Delete this member and move its contents to the root."
			},
			"spill": {
				icon: "mdi-arrow-expand-all",
				title: "Spill contents of this member."
			},
			"norecommend": {
				icon: "mdi-close",
				title: "Remove entry from recommendations."
			},
			"star" : function (member) {
				if ("object_id" in member) {
					return false;
				}
				return {
					icon: member.starred ? "mdi-star" : "mdi-star-outline",
					title: member.starred ? "Unstar this member" : "Star this member."
				};
			},
			"expand" : function (member) {
				if ("object_id" in member) {
					return false;
				}
				return {
					icon: "mdi-arrow-expand-all",
					title: "Expand this member"
				};
			},
			"uptohere": {
				icon: "mdi-arrow-collapse-right",
				title: "Select all members up to this one"
			}
	};
	
	var $membersDragging;
	var memberDraggable = {
		handle: ".member-headline",
		scroll: true,
		containment: $nodePane,
		stack: ".member",
		// Revert dragging objects to their original position if not dropped on
		// valid target
		revert : function(target) {
			if (target === false) {
				$membersDragging.animate({
					"top" : 0,
					"left" : 0
				}, 200);
			}
			return false;
		},
		start : function(event, ui) {
			if (ui.helper.hasClass('ui-selected'))
				// Previously, one or more objects were selected
				$membersDragging = $('.member.ui-selected');
			else {
				// No object was selected before
				$membersDragging = $(ui.helper);
				$('.members').removeClass('ui-selected');
				$membersDragging.addClass('ui-selected');
			}

			$membersDragging.addClass("ui-draggable-dragging");
			console.log($membersDragging);
		},
		// Update positions of all dragging objects
		drag : function(event, ui) {
			var position = ui.helper.css([ "top", "left" ]);
			$membersDragging.css(position);
		},
		stop : function(event, ui) {
			$membersDragging.removeClass("ui-draggable-dragging");
		},
		// Short delay to prevent unwanted drags when clicking
		delay: 85
	};
	
	var memberDroppable = {
			accept: ".member",
			classes: {
				"ui-droppable-hover": "highlight",
			},
			drop: function( event, ui ) {
				var droppedMemberIDs = getMemberIDs($membersDragging);
				var node_id = $(this).data("node_id"); 
				
				console.log("droppedMemberIDs", droppedMemberIDs);
				console.log("node_id", node_id);
				
				$nodeStatus.text("Adding " + droppedMemberIDs.length + " members to " + node_id + "...");
				
				$.ajax({
					type: "POST",
					url: "/api/nodes/" + node_id + "/members",
					data: JSON.stringify(droppedMemberIDs),
					contentType: "application/json; charset=utf-8",
					dataType: "json",
				}).done(function (response) {
					var data = response.data;
					// Remove members from the view
					$membersDragging.closest(".col").fadeOut(1000, function() {
					    $(this).remove();
					  });
					
					$nodeStatus.text(flashMsg.get());
				}).fail(function (jqXHR, textStatus, errorThrown) {
					console.log(jqXHR, textStatus, errorThrown);
					$nodeStatus.text(textStatus + ", " + errorThrown);
				});
			},
		};
	
	/**
	 * Render a member (child or object)
	 * 
	 * Parameters:
	 * 	member: member object
	 *  controls: array of controls
	 */
	function render_member(member, controls) {
		controls = controls || [];
		var $member;
		if("object_id" in member) {
			// Render an object
			$member = $(obj_preview_template.render(member)).data("object_id", member["object_id"]);
		} else {
			// Render a node
			$member = $(node_preview_template.render(member)).data("node_id", member["node_id"]);
			
			if(member.starred) {
				$member.addClass("member-starred");
			} else {
				$member.addClass("member-node");
			}
			
			var $node_images = $member.children(".images").first();
			
			$.each(member["type_objects"], function (k, v) {
				$node_images.append('<img src="/get_obj_image/' + v + '" class="show-tt-fullsize" />');
			});
		}
		
		// Place controls
		var $controls = $member.find(".member-controls").first()
		$.each(memberControls, function (k, v) {
			if (!controls.includes(k)) {
				return true;
			}
			
			if($.isFunction(v)) {
				v = v(member);
			}
			
			if (v == false) {
				return true;
			}
			
			var classes = "mdi mdi-dark action " + v["icon"];
			$('<i class="' + classes + '" title="' + v["title"] + '"></i>').data("action", k).appendTo($controls);
		});
		
		$member.draggable(memberDraggable);
		
		if(member.starred) {
			$member.droppable(memberDroppable);
		}
		
		return $member;
	}
	
	/**
	 * Render the objects / children spaceholder
	 */
	function render_obj_child_spaceholder() {
		var $member = $('<div class="card member member-special"/>');
		var $headline = $('<div class="member-headline"/>').appendTo($member);
		var $title = $('<div class="member-title" />').appendTo($headline);
		var $images = $('<div class="images img-9"/>').appendTo($member);
		
		console.log(appState);
		
		if(appState.display == "children") {
			$member.data("display", "objects").addClass("member-object");
			$title.html('<i class="mdi mdi-dark mdi-blur"></i>Objects');
			$.each(appState.node.own_type_objects, function (k, v) {
				$images.append('<img src="/get_obj_image/' + v + '" class="show-tt-fullsize" />');
			});
		} else {
			$member.data("display", "children").addClass("member-node");
			$title.html('<i class="mdi mdi-dark mdi-hexagon-multiple"></i>Children');
			$.each(appState.node.type_objects, function (k, v) {
				$images.append('<img src="/get_obj_image/' + v + '" class="show-tt-fullsize" />');
			});
		}
		
		return $member;
	}
	
	/**
	 * @param state true=show, false=hide.
	 */
	function toggleRecommendPane(state) {
		if (state) {
			$("#recommend-header,#recommend-pane,#recommend-status").show();
			$("#grid").css({"grid-template-columns": "300px 3fr 1fr"});
		} else {
			$("#recommend-pane,#recommend-status").empty();
			$("#recommend-header,#recommend-pane,#recommend-status").hide();
			$("#grid").css({"grid-template-columns": "300px 1fr auto"});
		}
	}
	
	/**
	 * Parse a Link HTTP header field value and return a mapping of {rel: url}
	 */
	function parseLinkHeader(textValue) {
		var data = {};
		var parseUri = /<([^>]*)>/;
		var unquote = /"([^"]*)"/;
		$.each(textValue.split(","), function (i, v) {
			var linkValues = v.split(";");
			var uri = linkValues[0].match(parseUri)[1];
			
			$.each(linkValues.slice(1), function (ii, vv) {
				var linkParams = vv.split("=");
				if (linkParams[0].trim() == "rel") {
					data[linkParams[1].match(unquote)[1]] = uri;
				}
			});
		});
		
		return data;
	}
	
	/* * * * * * * * * *
	 * Button handlers *
	 * * * * * * * * * */
	
	function _btnMerge() {
		var node = appState.node;
		var parent_id = node.path[node.path.length - 2];
		
		node_merge_into(node.node_id, parent_id).done(function (data) {
			flashMsg.set("Merged " + node.id + ".");
			// Go to next deepest node
			loadNextNode(parent_id).fail(nodeStatusErrorHandler);
		}).fail(function (jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			$nodeStatus.text(textStatus + ", " + errorThrown);
		});
		
		return false;
	}
	$("#btn-merge-into-parent").click(_btnMerge);
	
	function nodeStatusErrorHandler(jqXHR, textStatus, errorThrown) {
		console.log(jqXHR, textStatus, errorThrown);
		$nodeStatus.text(textStatus + ", " + errorThrown);
	}
	
	function _btnApprove() {
		/*
		 * The descendants of this node look alike.
		 * Approve and go to next node.
		 */
		var node = appState.node;
		var strategy = $("#btn-next").data("strategy");
		
		// Approve current node
		patchNode(node.node_id, {approved: true}).done(function (data) {
			// Go to next deepest node
			loadNextNode(node.node_id, strategy=="leaf").fail(nodeStatusErrorHandler);
		}).fail(nodeStatusErrorHandler);
		
		return false;
	}
	$("#btn-approve").click(_btnApprove);
	
	/*
	 * Recommendation
	 */
	$("#btn-recommend").click(function () {
		var $this = $(this);
		if($this.hasClass("active")) {
			// Deactivate
			$this.removeClass("active");
			toggleRecommendPane(false);
		} else {
			$this.addClass("active");
			toggleRecommendPane(true);
			
			var node_id = appState.node.node_id;
			display_recommendations(node_id);
		}
		
		return false;
	});
	
	$("#btn-rec-add").click(function () {
		var selectedMembers = getSelectedMembers("#recommend-pane");
		var node_id = appState.node.node_id;
		
		$recommendStatus.text("Adding " + selectedMembers.length + " members to " + node_id + "...");
		
		$.ajax({
			type: "POST",
			url: "/api/nodes/" + node_id + "/members",
			data: JSON.stringify(selectedMembers),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
		}).done(function (data) {
			// Remove members from recommend-pane
			$(".member.ui-selected", "#recommend-pane").closest(".col").remove();
			
			// Update node
			loadNode(node_id, appState);
			
			$recommendStatus.empty();
		}).fail(function (jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			$recommendStatus.text(textStatus + ", " + errorThrown);
		});
		
		return false;
	});
	
	$("#btn-rec-reload").click(function () {
		var node_id = appState.node.node_id;
		display_recommendations(node_id);
		
		return false;
	});
	
	$(".btn-rec-jump").click(function () {
		var npages = parseInt($(this).data("npages"));
		console.log("Jump", npages)
		recommendJumpToPage = recommendNextPage + npages;
		$(document).trigger("recommend_do_scroll.morphocluster");
		//$recommendPane.scrollTop($recommendPane.prop('scrollHeight'))
		return false;
	});
	
	/* * * * * * * * * *
	 * Event handlers  *
	 * * * * * * * * * */
	$('body').on("dblclick", ".member-title", function(event) {
		var $member = $(this).closest(".member");
		
		
		if($member.hasClass("member-special")) {
			var display = $member.data("display");
			loadNode(appState.node.node_id, {display: display});
		} else {
			var node_id = $member.data("node_id");
			if(typeof(node_id) != "undefined") {
				loadNode(node_id);
			}
		}
		
		return false;
	});
	
	/**
	 * Hide the provided member by hiding its parent `.col`.
	 */
	function hide_member($member) {
		$member.closest(".col").hide();
	}
	
	$('body').on("click", ".action", function(event) {
		var $this = $(this);
		var $member = $this.closest(".member");
		var member_node_id = $member.data("node_id");
		var current_node_id = appState.node.node_id;
		var action = $this.data("action");
		
		console.log(member_node_id, action, this);
		
		if (action == "star") {
			var starred = $this.hasClass("mdi-star");
			
			patchNode(member_node_id, {starred: !starred}).done(function (data) {
				$this.toggleClass("mdi-star mdi-star-outline");
			}).fail(function (jqXHR, textStatus, errorThrown) {
				console.log(jqXHR, textStatus, errorThrown);
				$nodeStatus.text(textStatus + ", " + errorThrown);
			});
		} else if (action == "expand") {
			node_merge_into(member_node_id, current_node_id).done(function (data) {
				// Update display
				loadNode(current_node_id, appState);
				
				$nodeStatus.text(flashMsg.get());
			}).fail(function (jqXHR, textStatus, errorThrown) {
				console.log(jqXHR, textStatus, errorThrown);
				$nodeStatus.text(textStatus + ", " + errorThrown);
			});
		}  else if (action == "moveup") {
			var path = appState.node.path;
			var parent_id = path[path.length - 2];
			
			var members = getMemberIDs($member);
			
			node_adopt_members(parent_id, members).done(function (data) {
				hide_member($member);
				
				$nodeStatus.text(flashMsg.get());
			}).fail(function (jqXHR, textStatus, errorThrown) {
				console.log(jqXHR, textStatus, errorThrown);
				$nodeStatus.text(textStatus + ", " + errorThrown);
			});
		} else if (action == "uptohere") {
			var $selectable = $member.closest(".ui-selectable");
			var $members = $selectable.find(".member");
			$selectable._$lastSelected = $members[0];
			var stop = $members.index($member) + 1;
			$members.slice(0, stop).addClass("ui-selected highlight");
		}
		
		return false;
	});
	
	/**
	 * Return a list of objects with properties object_id or node_id depending on the type of the member.
	 */
	function getMemberIDs($members) {
		return $.map($members, function (member) {
			var object_id = $(member).data("object_id");
			if (typeof(object_id) != "undefined") {
				return {object_id: object_id}
			}
			var node_id = $(member).data("node_id");
			if (typeof(node_id) != "undefined") {
				return {node_id: node_id}
			}
		});
	}
	
	/* * * * * * * * * * * * * * *
	 * Selectable functionality  *
	 * * * * * * * * * * * * * * */
	function getSelectedMembers(context) {
		return getMemberIDs($(".member.ui-selected", context));
	}
	
	/**
	 * Select a whole range of selectables and return them.
	 */
	function _selectRange(that, event) {
		var $selected = $(that).find('.member.ui-selected');
		
		if ($selected.length == 0) {
			that._$lastSelected = null;
			console.log("Unset _$lastSelected.");
		} else if (that._$lastSelected != null && $selected.length == 1 && event.shiftKey) {
			// Select all from this._$lastSelected to current selection
			var $members = $(that).find('.member');
			var start = $members.index(that._$lastSelected);
			var stop = $members.index($selected.last()) + 1;
			
			$selected = $members.slice(start, stop).addClass("ui-selected highlight");
		} else if ($selected.length > 0) {
			that._$lastSelected = $selected.first();
			console.log("Set _$lastSelected.");
		} 
		
		return $selected;
	}
	
	$("#node-pane").selectable({
		filter: ".member",
		appendTo: "#node-pane",
		cancel: ".pane-header, .member-headline, .load-more, .member-special",
		classes: {
		    "ui-selecting": "highlight",
		    "ui-selected": "highlight",
		},
		stop: function (event, ui) {
			console.log(event, ui);
			
			var $selected = _selectRange(this, event);
			var selectedMembers = getMemberIDs($selected);
			
			$("#btn-group-selected").toggleClass("disabled", selectedMembers.length < 1);
			
			$nodeStatus.text("Selected " + selectedMembers.length + " members.");
		}
	});
	
	$("#recommend-pane").selectable({
		filter: ".member",
		appendTo: "#recommend-pane",
		cancel: ".pane-header, .member-headline, .load-more",
		classes: {
		    "ui-selecting": "highlight",
		    "ui-selected": "highlight",
		},
		stop: function (event, ui) {
			var $selected = _selectRange(this, event);
			var selectedMembers = getMemberIDs($selected);
			
			$recommendStatus.text("Selected " + selectedMembers.length + " candidates.");
		}
	});
	
	/*
	 * Umbrella term
	 */
	function createUmbrellaTerm(name) {
		
	}
	
	var $umbrellaTermForm;
	var $umbrellaTermDialog = $("#dialog-umbrella").dialog({
		autoOpen: false,
		height: 400,
		width: 350,
		modal: true,
	});
	
	$umbrellaTermForm = $umbrellaTermDialog.find("form").on("submit", function(event) {
		var name = $("#dialog-umbrella-input-term").val();
		var parentNodeId = appState.node.node_id;
		
		var selectedMembers = getSelectedMembers("#node-pane");
		console.log("Grouping: ", selectedMembers, "as new child of", parentNodeId, "with name", name);
		
		$nodeStatus.text("Saving umbrella term...");
		
		$.ajax({
			type: "POST",
			url: "/api/nodes",
			data: JSON.stringify({parent_id: parentNodeId, name: name, members: selectedMembers, starred: 1}),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
		}).done(function (response) {
			console.log("Success:", response);
			
			$nodeStatus.text("Merged " + selectedMembers.length + " members into " + response["node_id"]);
			
			// Reload current view
			loadNode(parentNodeId, appState);
		}).fail(function (jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			$nodeStatus.text(textStatus + ", " + errorThrown);
		}).always(function () {
			$umbrellaTermDialog.dialog("close");
		});
		
		return false;
	});
	
	$("#btn-group-selected").on("click", function () {
		if($(this).hasClass("disabled")) {
			return;
		}
		
		$("#dialog-umbrella-input-term").val("");
		$umbrellaTermDialog.dialog("open");
	});
	
	/*
	 * Classify
	 */
	$("#btn-classify-members").on("click", function () {
		var node_id = appState.node.node_id;
		
		console.log("Classifying", node_id);
		
		$nodeStatus.text("Classifying " + appState.display + " of " + node_id + " into starred members...");
		
		req_params = {safe: false, subnode: true};
		req_params[appState.display == "children" ? "nodes" : "objects"] = 1;
		
		$.ajax({
			type: "POST",
			url: "/api/nodes/" + node_id + "/classify?" + $.param(req_params),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
		}).done(function (resonse) {
			console.log(resonse);
			// Display parent node
			loadNode(node_id, appState);
			
			flashMsg.set(`Sorted ${resonse.n_predicted_children} children and ${resonse.n_predicted_objects} objects.`);
		}).fail(function (jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			$nodeStatus.text(textStatus + ", " + errorThrown);
		});
		
		return false;
	});
	
	/*
	 * Tree controls
	 */
	
	function loadNextNode(node_id, leaf) {
		leaf = (typeof leaf !== 'undefined') ? leaf : false;
		console.log("leaf:", leaf);
		return $.get("/api/nodes/" + node_id  + "/next", {leaf: leaf}).done(function (next_node_id) {
			$("#tree-status").empty();
			
			loadNode(next_node_id);
		});
	}
	
	$(".btn-next-strategy").on("click", function (e) {
		var $this = $(this);
		var $btnNext = $("#btn-next");
		var strategy = $this.data("strategy");
		console.log(strategy);
		
		$btnNext.data("strategy", strategy);
		$btnNext.find(".next-icon").toggleClass("mdi-leaf", strategy=="leaf");
		$btnNext.find(".next-icon").toggleClass("mdi-hexagon-multiple", strategy=="node");
		
		e.preventDefault();
	});
	
	function _btnNext() {
		if(typeof(appState.node) == "undefined") {
			return;
		}
		
		var node_id = appState.node.node_id;
		var strategy = $("#btn-next").data("strategy");
		
		$nodeStatus.text("Loading next node to approve after " + node_id + "...");
		console.log("node_id:", node_id);
		
		loadNextNode(node_id, strategy=="leaf").fail(function (jqXHR, textStatus, errorThrown) {
			$("#tree-status").text(textStatus + ", " + errorThrown);
		});
	}
	$("#btn-next").on("click", _btnNext);
	
	function _btnUp() {
		if(typeof(appState.node) == "undefined") {
			return;
		}
		
		var path = appState.node.path;
		var parent_id = path[path.length - 2];
		
		loadNode(parent_id);
	}
	$("#btn-up").on("click", _btnUp);
	
	/*
	 * Keyboard shortcuts
	 */
	$(document).keyup(function (e) {
		if($(e.target).is("input,textarea")) {
			return;
		}
		
		if(e.key=="a") {
			_btnApprove();
		} else if(e.key=="m") {
			_btnMerge();
		} else if(e.key=="n") {
			_btnNext();
		} else if(e.key=="u") {
			_btnUp();
		} else  {
			console.log(e);
		}
	});
}