# Static landing/download site for GenNal, served by nginx.
FROM nginx:1.27-alpine

# Site nginx config (clean URLs, asset caching, binary installer downloads).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ship the static site (HTML/CSS/assets) and the self-hosted installer.
COPY . /usr/share/nginx/html

# Keep only the web-servable files in the image root.
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/docker-compose.yml \
          /usr/share/nginx/html/nginx.conf \
          /usr/share/nginx/html/README.md \
          /usr/share/nginx/html/.dockerignore

EXPOSE 80
