# offline-knowledge: upstream kiwix-serve plus everything needed to fetch the
# ZIMs listed in zims.txt from inside the container (no host tools needed).
FROM ghcr.io/kiwix/kiwix-serve:3.8.2

USER root
RUN apk add --no-cache bash curl aria2 xmlstarlet

COPY container/knowledge.sh /usr/local/bin/knowledge
COPY zims.txt /etc/knowledge/zims.txt
RUN chmod 0755 /usr/local/bin/knowledge

# uid 1001 in the upstream image; docker-compose.yml maps the host user onto
# it (keep-id) so it can write to the bind-mounted CONTENT_DIR.
USER user
WORKDIR /data
EXPOSE 8080

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/knowledge"]
CMD ["serve"]
