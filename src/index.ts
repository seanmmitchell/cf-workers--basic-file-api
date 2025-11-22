interface Env {
	BFA: R2Bucket;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (!env.BFA) {
			return new Response('Internal Server Error: R2 Bucket not Available', { status: 500 });
		}

		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/upload') {
			return handleUpload(request, env.BFA);
		} else if (path.startsWith('/file')) {
			return handleR2Request(request, env.BFA);
		} else {
			return new Response('Not found', { status: 404 });
		}
	},
};


async function handleUpload(request: Request, bucket: R2Bucket): Promise<Response> {
	try {
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}
		const formData = await request.formData();
		const files = formData.getAll('file');
		if (!files.length) {
			return new Response('No files found in the request', { status: 400 });
		}

		const promises = files.map(async (file) => {
			if (file instanceof File) {
				const filename = file.name;
				return bucket.put(filename, file.stream());
			} else {
				throw new Error('Invalid file type');
			}
		});

		await Promise.all(promises);
		return new Response('Files uploaded successfully', { status: 200 });
	} catch (error) {
		if (error instanceof Error) {
			console.error('Error uploading files:', error);
			if (error.message === 'Invalid file type') {
				return new Response('Invalid file type', { status: 400 });
			}
		}
		return new Response('Internal Server Error: Failed to upload files', { status: 500 });
	}
}

async function handleR2Request(request: Request, bucket: R2Bucket): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace('/file/', '');

	switch (request.method) {
		case 'GET':
			if (path === '') {
				return listObjects(bucket);
			} else {
				return getObject(bucket, path);
			}
		case 'PUT':
			return putObject(bucket, path, request);
		default:
			return new Response('Method not allowed', { status: 405 });
	}
}

async function listObjects(bucket: R2Bucket): Promise<Response> {
	const objects = await bucket.list();
	return new Response(JSON.stringify(objects.objects), {
		headers: { 'Content-Type': 'application/json' },
	});
}

async function getObject(bucket: R2Bucket, key: string): Promise<Response> {
	const object = await bucket.get(key);
	if (!object) {
		return new Response('Object not found', { status: 404 });
	}
	return new Response(object.body, {
		headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' },
	});
}

async function putObject(bucket: R2Bucket, key: string, request: Request): Promise<Response> {
	await bucket.put(key, request.body);
	return new Response('Object uploaded successfully', { status: 200 });
}