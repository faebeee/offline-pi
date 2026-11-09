# offline-knowledge: upstream kiwix-serve plus everything needed to fetch the
# ZIMs listed in zims.txt from inside the container (no host tools needed).
FROM ghcr.io/kiwix/kiwix-serve:3.8.2

USER root
RUN apk add --no-cache bash curl aria2 xmlstarlet

# Outpost "Library" landing page (kiwix-serve --customIndex), assembled from
# the Outpost package (packages/ui; the build context is the repo root) into
# one self-contained file (see build-index.sh).
COPY apps/knowledge/container/ /tmp/knowledge-build/
COPY packages/ui/ /tmp/knowledge-build/ui/
RUN bash /tmp/knowledge-build/build-index.sh /tmp/knowledge-build /usr/share/knowledge/index.html \
    && rm -rf /tmp/knowledge-build

COPY apps/knowledge/container/knowledge.sh /usr/local/bin/knowledge
COPY apps/knowledge/zims.txt /etc/knowledge/zims.txt
RUN chmod 0755 /usr/local/bin/knowledge

# uid 1001 in the upstream image; compose.yml (repo root) maps the host user onto
# it (keep-id) so it can write to the bind-mounted CONTENT_DIR.
USER user
WORKDIR /data
EXPOSE 8080

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/knowledge"]
CMD ["serve"]
