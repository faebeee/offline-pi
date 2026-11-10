# offline-knowledge: upstream kiwix-serve plus everything needed to fetch the
# ZIMs selected on the Library screen from inside the container (no host
# tools needed). Nothing is downloaded until something is selected.
FROM ghcr.io/kiwix/kiwix-serve:3.8.2

USER root
RUN apk add --no-cache bash curl aria2 xmlstarlet

# The Library screen is in the web app (apps/web, /library); core's library
# domain reads kiwix's OPDS catalogue and search. kiwix-serve keeps its own
# viewer for reading articles, reached through core's passthrough
# (/svc/library/).
COPY apps/knowledge/container/knowledge.sh /usr/local/bin/knowledge
RUN chmod 0755 /usr/local/bin/knowledge

# uid 1001 in the upstream image; compose.yml (repo root) maps the host user onto
# it (keep-id) so it can write to the bind-mounted CONTENT_DIR.
USER user
WORKDIR /data
EXPOSE 8080

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/knowledge"]
CMD ["serve"]
