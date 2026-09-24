---
layout: page
title: projects
permalink: /projects/
description: Things I've built, from autonomous hardware to tools for people.
nav: true
nav_order: 3
---

<div class="project-grid">
{% assign sorted_projects = site.projects | sort: 'importance' %}
{% for project in sorted_projects %}
  {% include projects.liquid %}
{% endfor %}
</div>
