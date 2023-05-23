import type {
  ActionArgs,
  LinksFunction,
  LoaderArgs,
  V2_MetaFunction,
} from "@remix-run/node";
import { redirect, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import mapCss from "maplibre-gl/dist/maplibre-gl.css";
import { AssetImage } from "~/components/assets/asset-image";
import { DeleteAsset } from "~/components/assets/delete-asset";
import { LocationDetails } from "~/components/assets/location";
import { Notes } from "~/components/assets/notes";
import { ErrorBoundryComponent } from "~/components/errors";
import ContextualSidebar from "~/components/layout/contextual-sidebar";

import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";

import { Badge } from "~/components/shared";
import { Button } from "~/components/shared/button";
import TextualDivider from "~/components/shared/textual-divider";
import ProfilePicture from "~/components/user/profile-picture";
import { usePosition, useUserData } from "~/hooks";
import { deleteAsset, getAsset } from "~/modules/asset";
import { requireAuthSession, commitAuthSession } from "~/modules/auth";
import { getScanByQrId } from "~/modules/scan";
import { parseScanData } from "~/modules/scan/utils.server";
import { assertIsDelete, getRequiredParam } from "~/utils";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { parseMarkdownToReact } from "~/utils/md.server";
import { deleteAssets } from "~/utils/storage.server";

export async function loader({ request, params }: LoaderArgs) {
  const { userId } = await requireAuthSession(request);
  const id = getRequiredParam(params, "assetId");

  const asset = await getAsset({ userId, id });
  if (!asset) {
    throw new Response("Not Found", { status: 404 });
  }
  /** We get the first QR code(for now we can only have 1)
   * And using the ID of tha qr code, we find the latest scan
   */
  const lastScan = asset.qrCodes[0]?.id
    ? parseScanData({
        scan: (await getScanByQrId({ qrId: asset.qrCodes[0].id })) || null,
        userId,
      })
    : null;

  const notes = asset.notes.map((note) => ({
    ...note,
    content: parseMarkdownToReact(note.content),
  }));

  const header: HeaderData = {
    title: asset.title,
    subHeading: asset.id,
  };

  return json({
    asset: {
      ...asset,
      notes,
    },
    lastScan,
    header,
  });
}
export async function action({ request, params }: ActionArgs) {
  assertIsDelete(request);
  const id = getRequiredParam(params, "assetId");
  const authSession = await requireAuthSession(request);
  const formData = await request.formData();
  const mainImageUrl = formData.get("mainImage") as string;

  await deleteAsset({ userId: authSession.userId, id });
  await deleteAssets({
    url: mainImageUrl,
    bucketName: "assets",
  });

  sendNotification({
    title: "Asset deleted",
    message: "Your asset has been deleted successfully",
    icon: { name: "trash", variant: "error" },
  });

  return redirect(`/assets`, {
    headers: {
      "Set-Cookie": await commitAuthSession(request, { authSession }),
    },
  });
}

export const meta: V2_MetaFunction<typeof loader> = ({ data }) => [
  { title: appendToMetaTitle(data?.header?.title) },
];

export const handle = {
  breadcrumb: () => "single",
};

export const links: LinksFunction = () => [{ rel: "stylesheet", href: mapCss }];

export default function AssetDetailsPage() {
  const { asset } = useLoaderData<typeof loader>();
  const user = useUserData();
  usePosition();
  return (
    <>
      <AssetImage
        asset={{
          assetId: asset.id,
          mainImage: asset.mainImage,
          mainImageExpiration: asset.mainImageExpiration,
          alt: asset.title,
        }}
        className="mx-auto mb-8 h-[240px] w-full rounded-lg object-cover sm:w-[343px] md:hidden"
      />
      <Header>
        <Button
          to="qr"
          variant="secondary"
          icon="barcode"
          onlyIconOnMobile={true}
        >
          Download QR Tag
        </Button>
        <Button to="edit" icon="pen" role="link" onlyIconOnMobile={true}>
          Edit
        </Button>
        <DeleteAsset asset={asset} />
      </Header>
      <div className="mt-8 block lg:flex">
        <div className="shrink-0 overflow-hidden lg:w-[343px] xl:w-[400px]">
          <AssetImage
            asset={{
              assetId: asset.id,
              mainImage: asset.mainImage,
              mainImageExpiration: asset.mainImageExpiration,
              alt: asset.title,
            }}
            className="mx-auto mb-8 hidden h-auto w-[343px] rounded-lg object-cover md:block lg:w-full"
          />
          <p className="mb-8 text-gray-600">{asset.description}</p>
          <TextualDivider text="Details" className="mb-8 lg:hidden" />
          <ul className="item-information mb-8">
            {asset?.category ? (
              <li className="mb-4 flex justify-between">
                <span className="font-medium text-gray-600">Category</span>
                <div className="max-w-[250px]">
                  <Badge color={asset.category?.color}>
                    {asset.category?.name}
                  </Badge>
                </div>
              </li>
            ) : null}
            <li className="mb-4 flex justify-between">
              <span className="font-medium text-gray-600">Owner</span>
              <div className="max-w-[250px]">
                <span className="mb-1 ml-1 inline-flex items-center rounded-2xl bg-gray-100 px-2 py-0.5">
                  <ProfilePicture width="w-4" height="h-4" />
                  <span className="ml-1.5 text-[12px] font-medium text-gray-700">
                    {user?.firstName} {user?.lastName}
                  </span>
                </span>
              </div>
            </li>
          </ul>

          <LocationDetails />
        </div>

        <div className="w-full lg:ml-8">
          <TextualDivider text="Notes" className="mb-8 lg:hidden" />
          <Notes />
        </div>
      </div>
      <ContextualSidebar />
    </>
  );
}

export const ErrorBoundary = () => (
  <ErrorBoundryComponent title="Sorry, asset you are looking for doesn't exist" />
);